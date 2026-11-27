// The server's price preview (DB `price_preview`, web migration 20261127). Every
// figure for a price that is still being proposed or reviewed — the client's
// pending change, the pre-work hike, the contractor's "you'd receive" — comes from
// here, so the app never does fee or payout arithmetic (PLAN §0, owner decision
// 2026-11-27). The RPC mirrors the charge path (adjust-payment's preserved rate,
// create-payment-intent's waiver rule, the commission formula).
//
// Three outcomes, as every read: still loading (no figures yet), failed (no
// figures, never a guessed one), ok. MONEY: display only; touches none of the four
// payout guards. adjust-payment / propose_price_change compute what is charged.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useJobReadsEpoch } from "./refreshEpoch";

export type Preview = {
  oldPrice: number; newPrice: number; delta: number; rate: number;
  oldFee: number; newFee: number; oldTotal: number; newTotal: number;
  funded: number; balanceOwed: number; isHeld: boolean; waived: boolean;
  newPayout: number;
  /** What adjust-payment refunds on approval when we hold more than the new total (server, floored at 0). */
  refund: number;
  /** Above a half-cent, as web priceChangeMath (float noise is not a change). */
  isIncrease: boolean; isReduction: boolean;
};

export type PreviewRead = { pc: Preview | null; failed: boolean };

/** One call. `amount` null = the job's own shape (held: pending amount; unpaid: the hike). */
export async function readPricePreview(jobId: string, amount: number | null): Promise<Preview | null> {
  try {
    const { data, error } = await supabase.rpc("price_preview", { p_job_id: jobId, p_new_amount: amount }).maybeSingle();
    if (error || !data) return null;
    const n = (v: unknown) => Number(v);
    const delta = n(data.delta);
    return {
      oldPrice: n(data.old_price), newPrice: n(data.new_price), delta, rate: n(data.fee_rate),
      oldFee: n(data.old_fee), newFee: n(data.new_fee), oldTotal: n(data.old_total), newTotal: n(data.new_total),
      funded: n(data.funded), balanceOwed: n(data.balance_owed), isHeld: data.is_held === true, waived: data.waived === true,
      newPayout: n(data.new_payout), refund: n(data.refund_amount),
      isIncrease: delta > 0.005, isReduction: delta < -0.005,
    };
  } catch {
    return null;
  }
}

/**
 * The preview for a job, re-read whenever `stamp` changes (the job columns it
 * depends on) or `amount` changes. A typed amount is debounced, so a contractor
 * typing "250" asks once, not three times. `enabled` false = nothing to preview.
 */
export function usePricePreview(jobId: string | null | undefined, amount: number | null, stamp: string, enabled = true): PreviewRead {
  // The epoch makes a pull-to-refresh re-read a failed preview even when the job's columns didn't change.
  const epoch = useJobReadsEpoch();
  const key = enabled && jobId ? jobId + "|" + (amount ?? "stored") + "|" + stamp + "|" + epoch : null;
  const [res, setRes] = useState<{ key: string; pc: Preview | null } | null>(null);
  useEffect(() => {
    if (!key || !jobId) return;
    let live = true;
    const h = setTimeout(() => {
      void readPricePreview(jobId, amount).then((pc) => { if (live) setRes({ key, pc }); });
    }, amount == null ? 0 : 350);
    return () => { live = false; clearTimeout(h); };
  }, [key, jobId, amount]);
  // An answer for a different key is stale: show nothing until this one arrives.
  if (!key || !res || res.key !== key) return { pc: null, failed: false };
  return { pc: res.pc, failed: res.pc == null };
}

/** The job columns a stored-shape preview depends on: a change to any re-reads it. */
export const previewStamp = (job: any): string =>
  [job?.amount, job?.price_hike_from, job?.price_change_pending?.amount, job?.client_fee, job?.funded_amount, job?.payment_status].map((v) => String(v ?? "")).join("|");
