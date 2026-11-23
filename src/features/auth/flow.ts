// The sign-in pipeline every route shares:
//   signed in (password / Google / Apple / email link)
//     → two-step code if owed (mfaOwed, fails OPEN)
//     → resolveDestination (role rules)
//     → go(destination)
// PLAN.md §4.2. Web learned this the hard way: its Google route once skipped the
// second factor because the prompt lived only in the password handler. Here
// every route calls continueAfterSignIn, so none can skip it.
import { router } from "expo-router";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { supabase } from "@/lib/supabase";
import { readAuthUser } from "@/lib/authRead";
import { mfaOwed } from "@/lib/mfa";
import { clearMyProfile } from "@/lib/myProfile";
import { clearTermsStatus } from "@/lib/terms";
import { kvGet, kvRemove, kvSet } from "@/platform/storage";
import { notify } from "@/kit";
import { resolveDestination, type Destination, type WantedRole } from "./destination";

const MFA_PENDING = "ff_mfa_pending"; // survives an app kill mid-code, so relaunch asks again

export function go(d: Destination) {
  switch (d.kind) {
    case "client": return router.replace("/client");
    case "contractor": return router.replace("/contractor");
    case "contractorOnboarding": return router.replace("/contractor-onboarding");
    case "admin": return router.replace("/admin");
    case "choose": return router.replace("/choose-role");
    case "blocked": return router.replace({ pathname: "/auth-problem", params: { msg: d.msg, role: d.role ?? "" } });
    case "error": return router.replace({ pathname: "/auth-problem", params: { msg: d.msg, retry: "1" } });
  }
}

/** Call after ANY successful sign-in. `wantedRole` = the funnel's intent (null for plain sign-in). */
export async function continueAfterSignIn(wantedRole: WantedRole = null): Promise<void> {
  if (await mfaOwed()) {
    await kvSet(MFA_PENDING, wantedRole ?? "none");
    router.replace("/verify-code");
    return;
  }
  await finishSignIn(wantedRole);
}

/** After the code (or when none was owed). Re-reads the user: never trusts a stale id. */
export async function finishSignIn(wantedRole?: WantedRole): Promise<void> {
  const pending = await kvGet(MFA_PENDING);
  const wanted: WantedRole = wantedRole !== undefined ? wantedRole
    : pending === "client" || pending === "contractor" ? pending : null;
  await kvRemove(MFA_PENDING);
  const a = await readAuthUser();
  if (a.kind === "unknown") return go({ kind: "error", msg: "We couldn't confirm your sign-in just now. Check your connection, then try again." });
  if (a.kind === "signedOut") { router.replace("/welcome"); return; }
  go(await resolveDestination(a.userId, wanted));
}

/** Is a two-step code still owed from a sign-in the app was killed in the middle of? */
export async function mfaPendingFromLastRun(): Promise<boolean> {
  return (await kvGet(MFA_PENDING)) !== null;
}

/** Sign out everywhere this app holds a session. Push unregister joins here in Phase 6
 *  (it needs the session, so it goes first). If the saved session can't be removed,
 *  say so and stay put: walking to /welcome would be a lie the next launch exposes. */
export async function signOut(): Promise<boolean> {
  await kvRemove(MFA_PENDING);
  await GoogleSignin.signOut().catch(() => {}); // so the next Google sign-in shows the account chooser
  let failed = false;
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) failed = true;
  } catch { failed = true; }
  clearMyProfile();
  clearTermsStatus();
  if (failed) {
    notify("We couldn't finish signing you out. Try again.", "danger");
    return false;
  }
  router.replace("/welcome");
  return true;
}
