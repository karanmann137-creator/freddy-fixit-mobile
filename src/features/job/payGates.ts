// The client's pay / confirm gates, mirrored from web ClientDashboard (PLAN §6.3).
// NOT invented: each line names the web expression it copies. Pure, no I/O.
//
// MONEY: display and gating only. Touches none of the four payout guards
// (confirm_job_completion, auto_confirm_stale_jobs, release-payment,
// reconcile-payouts), all server-side. The charge functions still answer 428 on an
// unsigned agreement; this only decides which button is enabled and what it says,
// so the app refuses for the same reasons the website does, before the tap.
import { addressMissing } from "@/lib/jobRules";
import { jobFullyFunded } from "@/lib/jobFunding";

/** Web: `disabled={busyPay || contractBlocked || addressMissing(activeJob)}` on both Pay-deposit buttons. */
export const depositDisabled = (job: any, contractBlocked: boolean) => contractBlocked || addressMissing(job);

/** Web: `disabled={busyBalance || contractBlocked || !!activeJob.price_change_pending}` on both Pay-balance buttons. */
export const balanceDisabled = (job: any, contractBlocked: boolean) => contractBlocked || !!job?.price_change_pending;

/** Web: `disabled={busyReq || !!price_change_pending || (held && !jobFullyFunded)}` on Confirm & release. */
export const confirmDisabled = (job: any) =>
  !!job?.price_change_pending || (job?.payment_status === "held" && !jobFullyFunded(job));

/** Web: the deposit/balance panels show while held with money still outstanding. */
export const balanceOwedPanel = (job: any) => job?.payment_status === "held" && !jobFullyFunded(job);

/** Money already held or released: the deposit buttons never show (web's first branch). */
export const moneyIn = (job: any) => job?.payment_status === "held" || job?.payment_status === "released";

/**
 * The warning under a blocked pay button (web, verbatim but for "refresh the page",
 * which on a phone is pull-to-refresh). A check that FAILED says so: it never tells
 * the client to sign an agreement they may already have signed.
 */
export function contractNote(checkFailed: boolean, what: "deposit" | "balance"): string {
  if (checkFailed) return "We couldn't verify the service agreement. Pull down to refresh and try again.";
  return what === "balance"
    ? "Please sign the service agreement above before paying the balance."
    : "Please sign the service agreement above before paying for this job.";
}

/** What web's payForJob/payBalance say when tapped while blocked (the same words as the note). */
export function payRefusal(job: any, contractBlocked: boolean, checkFailed: boolean, what: "deposit" | "balance"): string | null {
  if (contractBlocked) return checkFailed ? contractNote(true, what) : "Please sign the service agreement above before paying for this job.";
  if (what === "balance" && job?.price_change_pending) return "Please approve or decline your pro's proposed price change first.";
  if (what === "deposit" && addressMissing(job)) return "Please confirm the service address just above before paying — your pro needs it to show up.";
  return null;
}
