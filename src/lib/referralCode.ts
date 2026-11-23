// NATIVE OVERRIDE of web src/lib/referralCode.ts. Same RPC and wording; storage is
// async (AsyncStorage). Read the web header for the why: a refusal at signup is
// STASHED and shown later next to the retry box, never thrown, because a referral
// code is never worth a failed signup. No synced file imports this.
import { supabase } from "@/lib/supabase";
import { kvGet, kvRemove, kvSet } from "@/platform/storage";

export const REF_CODE_KEY = "ff_ref_code";
export const REF_ERROR_KEY = "ff_ref_error";

export function referralReasonText(reason: string): string {
  switch (reason) {
    case "self": return "That's your own code — send it to a friend instead.";
    case "already_referred": return "This account has already used a referral code.";
    case "empty": return "Enter a code first.";
    case "code_retired": return "That code has already been used by a friend — each code is good for one person.";
    case "code_in_use": return "Someone else is already using that code. If they don't book within 30 days it frees up, so it's worth asking your friend again later.";
    default: return "We don't recognise that code. Check it and try again.";
  }
}

export async function stashReferralCode(code: string): Promise<void> {
  const c = (code || "").trim().toUpperCase();
  if (c) await kvSet(REF_CODE_KEY, c);
}
export async function stashedReferralCode(): Promise<string> { return (await kvGet(REF_CODE_KEY)) || ""; }
export async function peekReferralError(): Promise<string> { return (await kvGet(REF_ERROR_KEY)) || ""; }
export async function takeReferralError(): Promise<string> {
  const v = await kvGet(REF_ERROR_KEY);
  if (v) await kvRemove(REF_ERROR_KEY);
  return v || "";
}

/** Never throws. An RPC/network error keeps the code for the next sign-in; a real refusal clears it. */
export async function applyReferralAtSignup(code: string): Promise<void> {
  const c = (code || "").trim().toUpperCase();
  if (!c) return;
  try {
    const { data, error } = await supabase.rpc("apply_referral_code", { p_code: c });
    if (error) return;
    const d = data as { ok?: boolean; reason?: string } | null;
    if (d?.ok !== true) await kvSet(REF_ERROR_KEY, referralReasonText(String(d?.reason ?? "")));
  } catch { return; }
  await kvRemove(REF_CODE_KEY);
}
