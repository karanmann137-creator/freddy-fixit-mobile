// NATIVE OVERRIDE of web src/lib/referralPrompt.ts. Same keys, same 21-day cooldown;
// AsyncStorage instead of localStorage, so the predicates return promises.
// Not ported yet: requestReferralShare (the "rehire" moment, with its caller).
import { kvGet, kvSet } from "@/platform/storage";

export type ReferralPromptReason = "job_done" | "rehire";

const LS = {
  optOut: "ff_referral_optout",
  lastShown: "ff_referral_last_shown",
  jobDoneAsked: "ff_referral_jobdone_asked",
  rehireAsked: "ff_referral_rehire_asked",
};

const COOLDOWN_MS = 21 * 24 * 60 * 60 * 1000;

async function alreadyHandled(reason: ReferralPromptReason): Promise<boolean> {
  if ((await kvGet(LS.optOut)) === "1") return true;
  const last = Number((await kvGet(LS.lastShown)) || 0);
  if (last && Date.now() - last < COOLDOWN_MS) return true;
  if (reason === "job_done" && (await kvGet(LS.jobDoneAsked)) === "1") return true;
  if (reason === "rehire" && (await kvGet(LS.rehireAsked)) === "1") return true;
  return false;
}

export async function referralPromptOptOut(): Promise<void> {
  await kvSet(LS.optOut, "1");
}

export async function referralAskAllowed(reason: ReferralPromptReason): Promise<boolean> {
  return !(await alreadyHandled(reason));
}

export async function markReferralAsked(reason: ReferralPromptReason): Promise<void> {
  await kvSet(LS.lastShown, String(Date.now()));
  if (reason === "job_done") await kvSet(LS.jobDoneAsked, "1");
  if (reason === "rehire") await kvSet(LS.rehireAsked, "1");
}
