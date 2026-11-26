// SYNCED from freddy-fixit@fd39b99:src/lib/jobRules.ts. DO NOT EDIT HERE.
// Edit the web repo, then run `npm run sync`. See PLAN.md §2.
// ─────────────────────────────────────────────────────────────────────────────
// src/lib/jobRules.ts — the pure job predicates, in ONE place both clients read.
//
// WHY THIS FILE EXISTS. These used to live inside .tsx component and page files
// (JobPhotos, ConfirmAddress, client/shared, ContractorDashboard,
// ClientDashboard). The mobile app syncs src/lib/ verbatim and cannot import a
// web page, so each predicate was moved here BYTE-IDENTICAL and re-exported
// from (or imported by) its old file, so every existing import and mount is
// unchanged. "One predicate, shared by every reader" now holds across both
// clients, not just across one dashboard.
//
// RULES FOR THIS FILE
// - Pure: no React, no DOM, no window, no supabase, no network. The app syncs it.
// - A predicate here mirrors a server guard; it never replaces one. Browser-side
//   money predicates stay deliberately STRICTER than the server and are widened
//   toward it, never past it.
// - Money: browser-side display and gating only. It touches NONE of the four
//   payout guards (confirm_job_completion, auto_confirm_stale_jobs,
//   release-payment, reconcile-payouts), all of which are server-side. Nothing
//   here can move funded_amount or authorise a transfer.
// ─────────────────────────────────────────────────────────────────────────────

/** Round to cents the same way every other money path in the app does. */
const r2 = (n: number) => Math.round(n * 100) / 100;

// ── Job photos (moved from src/components/JobPhotos.tsx) ───────────────────

// Must match public.photo_rules_start() in the database. Jobs created before
// this were never prompted for a before photo, so they are not blocked on one.
// (It also lives in supabase/functions/visit-reminder/index.ts: change all three.)
export const PHOTO_RULES_START = Date.parse("2026-08-02T00:00:00Z");

export function beforeRequired(job: any): boolean {
  const created = Date.parse(job?.created_at ?? "");
  return !Number.isFinite(created) || created >= PHOTO_RULES_START;
}

/** What the contractor still owes on this job, in plain words. Empty = done. */
export function photosMissing(job: any): string[] {
  const out: string[] = [];
  if (!job?.before_photo_path && beforeRequired(job)) out.push("a before photo");
  if (!job?.completion_photo_path) out.push("a photo of the finished work");
  return out;
}

// ── Service address (moved from src/components/ConfirmAddress.tsx) ─────────

/**
 * The ONE answer to "does this job still need an address?".
 *
 * Shared by the panel, both Pay-deposit buttons and `payForJob()`, so the button
 * and the handler can never disagree — the same idiom as `photosMissing`,
 * `canWithdraw` and `canRemoveRequest`.
 *
 * Note it is keyed on the COLUMN being empty, not on a date or a flag. A job
 * that predates this feature and was already paid for has no `service_address`
 * and would read as "missing" — which is exactly why only the DEPOSIT buttons
 * consult it and the balance buttons never do. Gating a balance on this would
 * stall money that is already owed on a job whose pro has been on site.
 */
export const addressMissing = (job: any): boolean =>
  !String(job?.service_address || "").trim();

// ── Client: delete a request (moved from src/pages/client/shared.tsx) ──────

// Can the client actually delete this request? `remove_client_request` is guarded
// server-side by `job_money_block()`, so on a paid job the button could only ever
// raise — and it was rendered on every request that wasn't already cancelled.
//
// A COMPLETED request is the sharp case and the reason this exists. The RPC's
// assigned branch skips completed jobs when it cancels them, but still writes
// `client_requests.status = 'cancelled'` — so on a finished job that was never
// charged, the button doesn't fail loudly, it quietly relabels a completed job in
// the client's own history as cancelled. Hiding it is the fix; the RPC is right to
// keep its guard.
//
// `job` is the loaded job for this request, or null where we don't have it (the
// history list). Status alone answers those rows.
export const canRemoveRequest = (r: any, job: any): boolean => {
  if (!r || r.status === "cancelled" || r.status === "completed") return false;
  if (!job) return true;
  if (["held", "released", "disputed", "processing"].includes(job.payment_status ?? "unpaid")) return false;
  if (job.is_milestone || job.prepayment_id) return false;
  return !["in_progress", "pending_confirmation", "completed"].includes(job.status);
};

// ── Contractor: withdraw from a job (moved from src/pages/ContractorDashboard.tsx)

// Mirrors the server guard `job_money_block()`, which `withdraw_job()` calls.
// Withdrawal HARD-DELETES the job and every child cascades, so the DB refuses it
// the moment any money is attached. The button was rendered unconditionally, which
// meant it sat there dead on every deposit-paid job with nothing on screen saying so.
//
// It is deliberately STRICTER than the server, in the two places the browser can't
// see the whole truth: a milestone job holds real money per stage while
// jobs.payment_status is still 'unpaid', and `processing` means a Stripe checkout
// may be open right now. Over-hiding a destructive control costs a contractor one
// email; over-showing it offers to delete the only pointer to a live charge.
export const canWithdraw = (j: any): boolean =>
  (j?.payment_status ?? "unpaid") === "unpaid" &&
  !j?.is_milestone &&
  !j?.prepayment_id;

// ── Client: total and balance incl. the service fee (moved from ClientDashboard)
//
// NOT the same question as src/lib/jobFunding, and deliberately not folded into
// it. `jobBalanceDue` answers "what is outstanding on a CHARGED job" and reads 0
// when `total_charged` is null. These answer the client's pre-checkout question
// too: before a job is charged they SYNTHESISE the total from
// `amount * (1 + feeRate)` (0 when a referral waives the fee on this job). In
// ClientDashboard they were closures over the page's `feeRate` and
// `waivedForJob` state; here those two are parameters, and the page keeps
// `jobTotal(j)` / `jobBalance(j)` as one-line wrappers that pass them in. The
// arithmetic is unchanged.

/** The charged total when there is one, else the estimate at `feeRate`. */
export function estimateJobTotal(j: any, feeRate: number, waivedForJob: string | null) {
  if (j?.total_charged != null) return Number(j.total_charged);
  const amt = Number(j?.amount ?? 0);
  const rate = (j?.id && waivedForJob === j.id) ? 0 : feeRate;
  return r2(amt * (1 + rate));
}

/** What has been collected on this job so far, never negative. */
export function jobFunded(j: any) { return Math.max(Number(j?.funded_amount) || 0, 0); }

/** `estimateJobTotal` minus what has been collected, floored at 0. */
export function estimateJobBalance(j: any, feeRate: number, waivedForJob: string | null) {
  return Math.max(r2(estimateJobTotal(j, feeRate, waivedForJob) - jobFunded(j)), 0);
}

// ── Client: the saved-card (autopay) note (split from ClientDashboard's autopayNote)
//
// ONE decision and ONE wording, read by BOTH balance panels on the web (through
// the JSX wrapper `autopayNote` in ClientDashboard, which adds the icon, the
// colours and the on/off button) and by the app. So the "we'll charge your card"
// promise and the manual Pay button can never disagree about what is about to
// happen. Null when there is no saved card — most jobs.
//
// `balance` is the caller's figure for what is left to pay (the web passes its
// `jobBalance(j)`). `parts` marks the words the web renders in <strong>; the
// plain string is `autopayNoteText`.

export type AutopayNotePart = string | { strong: string };
export type AutopayNote = { kind: "failed" | "on" | "off"; parts: AutopayNotePart[] };

export function autopayNoteParts(j: any, whenText: string, balance: number): AutopayNote | null {
  if (!j?.stripe_payment_method_id) return null;
  const err = j.autopay_last_error as string | null;
  const attempts = Number(j.autopay_attempts || 0);
  if (err) return {
    kind: "failed",
    parts: [
      "We tried to charge your saved card and it didn't go through: " + err + " " +
      (attempts < 3 ? "We'll try again tomorrow — or pay below to settle it now." : "We won't try again — please pay below."),
    ],
  };
  if (j.autopay_balance) return {
    kind: "on",
    parts: [
      "Your card is saved, so the remaining ", { strong: "$" + balance.toFixed(2) },
      " will be charged automatically " + whenText + ". It's still ", { strong: "held" },
      " — confirming the work is what releases it.",
    ],
  };
  return { kind: "off", parts: ["Automatic payment is off — pay the balance yourself below."] };
}

/** The autopay note as one plain string, or null when there is no saved card. */
export function autopayNoteText(j: any, whenText: string, balance: number): string | null {
  const note = autopayNoteParts(j, whenText, balance);
  return note ? note.parts.map(p => (typeof p === "string" ? p : p.strong)).join("") : null;
}
