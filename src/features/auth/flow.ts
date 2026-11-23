// The sign-in pipeline every route shares:
//   beginSignIn (record intent) → provider sign-in → continueAfterSignIn
//     → two-step code if owed (mfaOwed, fails OPEN like web)
//     → resolveDestination (role rules) → go(destination)
// PLAN.md §4.2. Web learned this the hard way: its Google route once skipped the
// second factor because the prompt lived only in the password handler. Here every
// route calls continueAfterSignIn, and check-rules mounts prove it.
//
// THE PENDING RECORD (review G3 #3). It is written BEFORE the provider call and
// cleared only when the person reaches a real destination. So an app killed at any
// point after a session exists (mid-code, mid-name-save, mid-network) resumes the
// pipeline on next launch instead of walking past the code, and a Retry keeps the
// funnel's role intent. A failed sign-in clears it.
import { router } from "expo-router";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { supabase } from "@/lib/supabase";
import { readAuthUser } from "@/lib/authRead";
import { mfaOwed } from "@/lib/mfa";
import { clearMyProfile } from "@/lib/myProfile";
import { clearTermsStatus } from "@/lib/terms";
import { kvGetJson, kvRemove, kvSetJson } from "@/platform/storage";
import { notify } from "@/kit";
import { resolveDestination, type Destination, type WantedRole } from "./destination";

const PENDING = "ff_signin_pending";
type Pending = { wanted: WantedRole; codeOwed?: boolean; firstName?: string | null; lastName?: string | null };

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

/** Call BEFORE the provider's sign-in call. */
export async function beginSignIn(wanted: WantedRole = null): Promise<void> {
  await kvSetJson(PENDING, { wanted } satisfies Pending);
}
/** The provider call failed or was cancelled: there's no session to resume. */
export async function abandonSignIn(): Promise<void> { await kvRemove(PENDING); }

/** Apple sends the name ONCE. Keep it in the pending record until it's safely on the profile. */
export async function rememberFirstSignInName(firstName?: string | null, lastName?: string | null): Promise<void> {
  if (!firstName && !lastName) return;
  const p = (await kvGetJson<Pending>(PENDING)) ?? { wanted: null };
  await kvSetJson(PENDING, { ...p, firstName, lastName });
}

export async function pendingSignIn(): Promise<Pending | null> { return kvGetJson<Pending>(PENDING); }

/** After ANY successful sign-in (and on relaunch when a sign-in was left unfinished). */
export async function continueAfterSignIn(): Promise<void> {
  const p = (await kvGetJson<Pending>(PENDING)) ?? { wanted: null };
  if (p.codeOwed || (await mfaOwed())) {
    await kvSetJson(PENDING, { ...p, codeOwed: true });
    router.replace("/verify-code");
    return;
  }
  await finishSignIn();
}

/** After the code (or when none was owed). Re-reads the user: never trusts a stale id. */
export async function finishSignIn(): Promise<void> {
  const p = (await kvGetJson<Pending>(PENDING)) ?? { wanted: null };
  const a = await readAuthUser();
  if (a.kind === "unknown") return go({ kind: "error", msg: "We couldn't confirm your sign-in just now. Check your connection, then try again." });
  if (a.kind === "signedOut") { await abandonSignIn(); router.replace("/welcome"); return; }
  if (p.codeOwed) await kvSetJson(PENDING, { ...p, codeOwed: false }); // the code was just verified
  const d = await resolveDestination(a.userId, p.wanted);
  if (d.kind === "error") return go(d); // keep the record: Retry resumes with the same intent
  // The profile row is guaranteed now (resolveDestination ensured it), so the one-time name can land.
  const nameSaved = await saveFirstSignInName(a.userId, p.firstName, p.lastName);
  if (nameSaved) await abandonSignIn();
  else await kvSetJson(PENDING, { wanted: null, firstName: p.firstName, lastName: p.lastName }); // retry next launch
  go(d);
}

/** Writes Apple's one-time name without overwriting a name already there.
 *  True = nothing left to save. False = couldn't confirm; keep it and try again later. */
async function saveFirstSignInName(userId: string, firstName?: string | null, lastName?: string | null): Promise<boolean> {
  if (!firstName && !lastName) return true;
  try {
    const { data: prof, error } = await supabase.from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle();
    if (error || !prof) return false; // a failed read must not lead to overwriting a real name
    const patch: { first_name?: string; last_name?: string } = {};
    if (firstName && !prof.first_name) patch.first_name = firstName;
    if (lastName && !prof.last_name) patch.last_name = lastName;
    if (!Object.keys(patch).length) return true;
    const { data, error: upErr } = await supabase.from("profiles").update(patch).eq("id", userId).select("id");
    return !upErr && !!data && data.length > 0; // a zero-row update throws nothing: check it
  } catch { return false; }
}

/** Sign out everywhere this app holds a session. Push unregister joins here in Phase 6
 *  (it needs the session, so it goes first). If the saved session can't be removed,
 *  say so and stay put: walking to /welcome would be a lie the next launch exposes. */
export async function signOut(): Promise<boolean> {
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
    return false; // the pending record stays, so a relaunch still asks for any owed code
  }
  await abandonSignIn();
  router.replace("/welcome");
  return true;
}
