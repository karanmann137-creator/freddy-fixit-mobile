// The Available tab's page-level helpers (PLAN step 5.5), copied from web
// ContractorDashboard.tsx / contractor/shared.tsx because they are not in a web
// src/lib module yet. WEB PREREQUISITE (noted in the 5.5 report): move
// `quoteTotal`, `openJobSearchFields` and the bid form validation into a web
// src/lib file (e.g. src/lib/bidForm.ts), then sync it here and delete this copy.
// Until then every line below is web's, word for word, and adds no rule.
import { benchmarkFor, targetBid, type ServicePrice } from "@/lib/servicePricing";

/** One open job, as `list_open_jobs()` returns it. */
export type OpenJob = {
  id: string;
  service_needed: string | null;
  location: string | null;
  preferred_schedule: string | null;
  job_description: string | null;
  photo_path: string | null;
  estimated_quote: number | null;
  quote_notes: string | null;
  created_at: string | null;
  is_preferred: boolean | null;
  is_recurring: boolean | null;
  recurring_frequency: string | null;
  budget_min: number | null;
  budget_max: number | null;
  budget_flexible: boolean | null;
  budget_grade: string | null;
  benchmark: number | null;
  benchmark_source: string | null;
  bid_count: number | null;
  my_amount: number | null;
  my_message: string | null;
  my_walkthrough: boolean | null;
  my_price_low: number | null;
  my_price_high: number | null;
};

/** The bid form, web `bidForm[r.id]`. Every number is the string the person typed. */
export type BidForm = {
  amount: string; message: string;
  labour?: string; parts?: string; callout?: string; assumptions?: string;
  subject?: boolean; price_low?: string; price_high?: string; used_base_price?: boolean; walkthrough?: boolean;
};

/** The cap the web card shows ("n/7", "This job already has 7 bids."). The server
 *  enforces its own cap in place_bid and says so in its refusal; this is display only. */
export const BID_CAP_SHOWN = 7;

/** web ContractorAvailableTab: `r.my_amount != null || r.my_walkthrough`. */
export const hasMyBid = (r: OpenJob) => r.my_amount != null || !!r.my_walkthrough;

/** web ContractorDashboard `priceFor`: the first service's price-book row. */
export const priceFor = (pricing: Record<string, ServicePrice>, svc?: string | null): ServicePrice | null =>
  pricing[(svc || "").split(",")[0].trim()] ?? null;

/** web shared.tsx `openJobSearchFields`, verbatim (it reads `description`, which
 *  list_open_jobs doesn't return: same on web, kept identical). */
export const openJobSearchFields = (r: any): (string | number | null | undefined)[] => [
  r?.service_needed, r?.location, r?.preferred_schedule, r?.description,
  r?.recurring_frequency,
];

/** web ContractorDashboard `quoteTotal`, verbatim. */
export function quoteTotal(f: any): number | null {
  const keys = ["labour", "parts", "callout"];
  const any = keys.some((k) => f?.[k] !== "" && f?.[k] != null);
  if (any) return keys.reduce((t, k) => t + (f[k] ? Number(f[k]) : 0), 0);
  return f?.amount ? Number(f.amount) : null;
}

/** The suggested bid, derived exactly as the web card and the web form both do. */
export function suggestedBid(r: OpenJob, pricing: Record<string, ServicePrice>): number | null {
  return targetBid(
    r.benchmark != null ? Number(r.benchmark) : (benchmarkFor(r.service_needed, pricing)?.benchmark ?? null),
    r.budget_min != null ? Number(r.budget_min) : null,
  );
}

/**
 * The form a pro starts from. Web shows the saved bid's values in the inputs
 * (`bidForm[id]?.x ?? r.my_x`) but submits only what was typed, so an untouched
 * walkthrough bid re-submits with no range and no walkthrough flag and is refused.
 * Here the form is seeded from what web SHOWS, so what is submitted is what is on
 * screen. Same fields, same values, no rule added.
 */
export function seedForm(r: OpenJob): BidForm {
  const wt = !!r.my_walkthrough;
  return {
    amount: r.my_amount != null ? String(r.my_amount) : "",
    message: r.my_message ?? "",
    walkthrough: wt,
    ...(wt ? {
      price_low: r.my_price_low != null ? String(r.my_price_low) : "",
      price_high: r.my_price_high != null ? String(r.my_price_high) : "",
    } : null),
  };
}

/** Typed money: digits and one decimal point. A phone keyboard can paste anything;
 *  web's <input type="number"> refuses it at the field, and so does this. */
export function moneyInput(s: string): string {
  const clean = s.replace(/[^0-9.]/g, "");
  const dot = clean.indexOf(".");
  return dot < 0 ? clean : clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, "");
}

export type PlaceBidArgs = {
  p_request_id: string; p_amount: number | null; p_message: string | null;
  p_labour: number | null; p_parts: number | null; p_callout: number | null;
  p_assumptions: string | null; p_subject_to_inspection: boolean;
  p_price_low: number | null; p_price_high: number | null;
  p_used_base_price: boolean; p_walkthrough: boolean;
};

/**
 * web `placeBid`'s checks, in web's order, with web's words. place_bid enforces
 * all of them server-side too; checking here means the pro sees the friendly
 * wording first. Returns the message to show, or the exact RPC arguments.
 */
export function buildBid(r: OpenJob, f: BidForm): { error: string } | { args: PlaceBidArgs } {
  const wt = !!f.walkthrough;
  let total = wt ? null : quoteTotal(f);
  if (!wt && total == null && r.my_amount != null) total = Number(r.my_amount);
  if (!wt && total == null) return { error: "Enter your bid amount or an itemised breakdown." };
  const lo = f.price_low !== undefined && f.price_low !== "" ? Number(f.price_low) : null;
  const hi = f.price_high !== undefined && f.price_high !== "" ? Number(f.price_high) : null;
  if (wt) {
    if (lo == null || hi == null || !isFinite(lo) || !isFinite(hi)) {
      return { error: "A walkthrough bid still needs a ballpark range — the client has nothing to compare without one." };
    }
    if (lo <= 0 || hi <= 0) return { error: "Your ballpark range needs to be more than zero." };
    if (hi < lo) return { error: "Your ballpark high can't be below the low." };
  } else if (lo != null && hi != null && hi < lo) {
    return { error: "Your estimated range high can't be below the low." };
  }
  const msg = f.message !== undefined ? f.message : (r.my_message ?? "");
  return {
    args: {
      p_request_id: r.id,
      p_amount: total,
      p_message: msg || null,
      p_labour: wt ? null : (f.labour ? Number(f.labour) : null),
      p_parts: wt ? null : (f.parts ? Number(f.parts) : null),
      p_callout: wt ? null : (f.callout ? Number(f.callout) : null),
      p_assumptions: f.assumptions || null,
      p_subject_to_inspection: !!f.subject,
      p_price_low: lo,
      p_price_high: hi,
      p_used_base_price: wt ? false : !!f.used_base_price,
      p_walkthrough: wt,
    },
  };
}

/** web "Waiting on client confirmation · …" summary of the pro's own bid. */
export function myBidSummary(r: OpenJob): string {
  return r.my_walkthrough
    ? (r.my_price_low != null && r.my_price_high != null ? ("Walkthrough first · $" + r.my_price_low + "–$" + r.my_price_high) : "Walkthrough-first offer")
    : ("$" + r.my_amount);
}
