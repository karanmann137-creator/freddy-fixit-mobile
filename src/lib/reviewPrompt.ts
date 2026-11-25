// NATIVE OVERRIDE of web src/lib/reviewPrompt.ts. Same keys, same 21-day cooldown,
// same dedupe; storage is async (AsyncStorage) instead of localStorage, so the
// predicates return promises. A failed storage read means "not handled yet", as on
// web (`ls()` null): asking once too often is better than never asking.
// Not ported yet: requestGoogleReview (its callers are signup and job-posted, steps
// 4.3/4.4: they come with their host). The job-done moment goes through
// completionPrompt.ts, which uses the two predicates below.
import { kvGet, kvSet } from "@/platform/storage";

export const GOOGLE_REVIEW_URL = "https://g.page/r/CYvpOy2pJh_YEAI/review";

export function reviewUrlReady(): boolean {
  return /^https?:\/\//.test(GOOGLE_REVIEW_URL) && !GOOGLE_REVIEW_URL.includes("REPLACE_WITH");
}

export type ReviewReason = "signup" | "job_posted" | "job_done";

const LS = {
  optOut: "ff_review_optout",
  lastShown: "ff_review_last_shown",
  signupAsked: "ff_review_signup_asked",
  postAsked: "ff_review_post_asked",
  jobDonePrefix: "ff_review_jobdone_",
};

const COOLDOWN_MS = 21 * 24 * 60 * 60 * 1000;

async function alreadyHandled(reason: ReviewReason, jobId?: string): Promise<boolean> {
  if ((await kvGet(LS.optOut)) === "1") return true;
  const last = Number((await kvGet(LS.lastShown)) || 0);
  if (last && Date.now() - last < COOLDOWN_MS) return true;
  if (reason === "signup" && (await kvGet(LS.signupAsked)) === "1") return true;
  if (reason === "job_posted" && (await kvGet(LS.postAsked)) === "1") return true;
  if (reason === "job_done" && jobId && (await kvGet(LS.jobDonePrefix + jobId)) === "1") return true;
  return false;
}

async function markHandled(reason: ReviewReason, jobId?: string): Promise<void> {
  await kvSet(LS.lastShown, String(Date.now()));
  if (reason === "signup") await kvSet(LS.signupAsked, "1");
  if (reason === "job_posted") await kvSet(LS.postAsked, "1");
  if (reason === "job_done" && jobId) await kvSet(LS.jobDonePrefix + jobId, "1");
}

export async function reviewOptOut(): Promise<void> {
  await kvSet(LS.optOut, "1");
}

/** The dedupe / opt-out / cooldown test (one implementation, shared with completionPrompt). */
export async function reviewAskAllowed(reason: ReviewReason, jobId?: string): Promise<boolean> {
  return reviewUrlReady() && !(await alreadyHandled(reason, jobId));
}

export async function markReviewAsked(reason: ReviewReason, jobId?: string): Promise<void> {
  await markHandled(reason, jobId);
}
