// Where does a signed-in person go? Port of web AuthCallback's `proceed`, shared
// by every way into the app: launch, email sign-in, Google, Apple, the email
// confirm link and the two-step code. PLAN.md §4.2–4.3. One function, so the
// role rules can't drift between sign-in routes (web had four copies once).
//
// The rules, all from web, each with an incident behind it:
//   * `wantedRole` is the INTENT of the funnel they started in, never identity.
//     An established admin or contractor wins on EVERY branch (web 2026-11-09:
//     the unguarded contractor branch silently demoted the admin).
//   * Role writes go through setMyRole(), whose refusal is SHOWN (`blocked`),
//     never walked past (web 2026-11-09: the refusal loop with no explanation).
//   * The profile row can lag the signup trigger: poll, then ensure_profile()
//     (a zero-row update throws nothing).
//   * A stashed terms tick is redeemed only if it exists (an OAuth sign-in
//     never ticked anything).
//
// One deliberate difference from web: a FAILED read is `error` (Retry), not "no
// history". Web only runs this right after a sign-in, but the app runs it on
// every launch too, so treating offline as "brand-new account" would put an
// established customer in front of the role chooser.
import { supabase } from "@/lib/supabase";
import { clearMyProfile } from "@/lib/myProfile";
import { setMyRole } from "@/lib/roleWrite";
import { redeemStashedTermsConsent } from "@/lib/terms";
import { applyReferralAtSignup, stashedReferralCode } from "@/lib/referralCode";
import { kvGet, kvSet } from "@/platform/storage";

export type WantedRole = "client" | "contractor" | null;
export type Destination =
  | { kind: "client" }
  | { kind: "contractor" }
  | { kind: "contractorOnboarding" }
  | { kind: "admin" }
  | { kind: "choose" }
  | { kind: "blocked"; msg: string; role: string | null }
  | { kind: "error"; msg: string };

// Per account (CodeRabbit #5): a shared phone must not let account B inherit A's "already chose".
const roleChosenKey = (userId: string) => `ff_role_chosen:${userId}`;
const OFFLINE = "We couldn't reach Freddy Fix It just now. Check your connection, then try again.";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A PERMANENT refusal (the one-account-type rule) is shown as a refusal; a transient
 *  failure (network, row not ready) is Retry. roleWrite's own text says "refresh the
 *  page", which a phone doesn't have, so transient failures use the app's wording. */
function refused(w: { reason: string; permanent: boolean }, role: string | null): Destination {
  return w.permanent ? { kind: "blocked", msg: w.reason, role } : { kind: "error", msg: OFFLINE };
}

function byRole(role: string | null | undefined): Destination {
  if (role === "admin") return { kind: "admin" };
  if (role === "contractor") return { kind: "contractor" };
  return { kind: "client" };
}

async function readRole(userId: string, wantedRole: WantedRole): Promise<{ role: string | null; failed: boolean }> {
  for (let i = 0; i < 8; i++) {
    const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (data) return { role: data.role, failed: false };
    await sleep(250); // no row yet (trigger behind) or the read failed: either way, try again
  }
  // The trigger lost the race (or reads are failing): ensure_profile creates the row
  // AND returns its role, so one call both heals and answers.
  const { data: ensured, error } = await supabase.rpc("ensure_profile", { p_role: wantedRole === "contractor" ? "contractor" : "client" });
  clearMyProfile();
  if (error || !ensured) return { role: null, failed: true };
  return { role: ensured, failed: false };
}

async function hasContractorRow(userId: string): Promise<boolean | null> {
  const { data, error } = await supabase.from("contractors").select("id").eq("id", userId).maybeSingle();
  return error ? null : !!data;
}

/** A contractor lands on onboarding until their contractors row exists. */
async function contractorHome(userId: string): Promise<Destination> {
  const c = await hasContractorRow(userId);
  if (c === null) return { kind: "error", msg: OFFLINE };
  return c ? { kind: "contractor" } : { kind: "contractorOnboarding" };
}

export async function resolveDestination(userId: string, wantedRole: WantedRole): Promise<Destination> {
  const { role, failed } = await readRole(userId, wantedRole);
  if (failed) return { kind: "error", msg: OFFLINE };

  await redeemStashedTermsConsent().catch(() => {}); // covered by the gate if it fails

  if (wantedRole === "contractor") {
    if (role === "admin") return byRole(role);
    const w = await setMyRole(userId, "contractor");
    if (!w.ok) return refused(w, role);
    return contractorHome(userId);
  }

  if (wantedRole === "client") {
    if (role === "admin") return byRole(role);
    if (role === "contractor") return contractorHome(userId);
    await applyReferralAtSignup(await stashedReferralCode()); // never throws; a refusal is stashed for the dashboard
    return { kind: "client" };
  }

  // No funnel intent (plain sign-in, or app launch). Established accounts skip the chooser.
  if (role === "admin") return byRole(role);
  if (role === "contractor") return contractorHome(userId);
  // A code typed in the signup funnel whose email link opened on the website: the
  // person then signs in here with no funnel intent, so the stash is redeemed on
  // this branch too (review G4a #1). No-op when nothing is stashed; never throws.
  await applyReferralAtSignup(await stashedReferralCode());
  if (await kvGet(roleChosenKey(userId))) return byRole(role);
  const [reqs, con] = await Promise.all([
    supabase.from("client_requests").select("id").eq("user_id", userId).limit(1),
    supabase.from("contractors").select("id").eq("id", userId).maybeSingle(),
  ]);
  if (reqs.error || con.error) return { kind: "error", msg: OFFLINE };
  if ((reqs.data && reqs.data.length > 0) || con.data) return byRole(role);
  return { kind: "choose" }; // brand-new account with no history: ask what they're here for
}

/** The chooser's write. Never marks "chosen" after a refused write (that would strand the role). */
export async function chooseRole(userId: string, role: "client" | "contractor"): Promise<Destination> {
  const w = await setMyRole(userId, role);
  if (!w.ok) return refused(w, null);
  await kvSet(roleChosenKey(userId), "1");
  return role === "contractor" ? { kind: "contractorOnboarding" } : { kind: "client" };
}
