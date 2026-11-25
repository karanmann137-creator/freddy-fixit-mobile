// NATIVE OVERRIDE of web src/lib/completionPrompt.ts: the one ask that fires when a
// client's job is finished (review AND referral share in one sheet, review first).
// Same rules as web: the two halves are decided and stamped independently, by the
// two prompt modules' own predicates (no third set of keys here). `bus` replaces the
// window CustomEvent; CompletionThanksHost (mounted in the root layout) listens.
// Async because the predicates read AsyncStorage; it never throws (a prompt is never
// worth breaking the screen that asked).
import { emit } from "@/lib/bus";
import { markReviewAsked, reviewAskAllowed } from "@/lib/reviewPrompt";
import { markReferralAsked, referralAskAllowed } from "@/lib/referralPrompt";

export const COMPLETION_THANKS_EVENT = "ff:completion-thanks";
export type CompletionThanks = { review: boolean; code: string | null };

export async function requestCompletionThanks(opts: {
  jobId?: string;
  code?: string | null;
  codeStatus?: string | null;
}): Promise<void> {
  try {
    // A code a friend already holds (`in_use`) or has spent (`retired`) is never offered.
    const wantReview = await reviewAskAllowed("job_done", opts.jobId);
    const wantReferral = !!opts.code && opts.codeStatus === "active" && (await referralAskAllowed("job_done"));
    if (!wantReview && !wantReferral) return;
    if (wantReview) await markReviewAsked("job_done", opts.jobId);
    if (wantReferral) await markReferralAsked("job_done");
    emit(COMPLETION_THANKS_EVENT, { review: wantReview, code: wantReferral ? opts.code ?? null : null } satisfies CompletionThanks);
  } catch { /* a prompt is never worth a failure */ }
}
