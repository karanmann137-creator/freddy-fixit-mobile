// Sign-in screens. PLAN.md §4. Each is a thin port of the web page named beside it.
import React, { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Button, Card, DeadEnd, Field, FormNote, Row, Stack, Txt, notify, rgba, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { readAuthUser } from "@/lib/authRead";
import { mfaReason } from "@/lib/mfa";
import { AuthShell } from "./AuthShell";
import { OAuthButtons } from "./OAuthButtons";
import { PasswordField } from "./PasswordField";
import { chooseRole } from "./destination";
import { abandonSignIn, beginSignIn, continueAfterSignIn, finishSignIn, go, signOut } from "./flow";
import { kvGet, kvRemove, kvSet } from "@/platform/storage";

const WEB = "https://freddyfixit.ca";

function TextLink({ children, onPress, label }: { children: string; onPress: () => void; label?: string }) {
  const { t } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={label ?? children} hitSlop={t.s3}
      style={{ minHeight: t.hCtl, justifyContent: "center" }}>
      <Txt size={0.88} color={t.accent500}>{children}</Txt>
    </Pressable>
  );
}

// ---------------------------------------------------------------- welcome
export function WelcomeScreen() {
  const { t } = useTheme();
  return (
    <AuthShell title="Welcome" sub="Trusted local pros for home repairs in Calgary.">
      <Stack>
        <Button variant="primary" full onPress={() => router.push("/sign-in")}>Sign in with email</Button>
      </Stack>
      <OAuthButtons signInSurface />
      <View style={{ marginTop: t.s6, borderTopWidth: t.hairW, borderTopColor: t.hair, paddingTop: t.s4 }}>
        <Txt size={0.85} color={rgba(t.muted, 0.7)}>New to Freddy Fix It?</Txt>
        {/* Both signups are native: the client funnel (PLAN 4.4) and contractor onboarding (5.2). */}
        <TextLink onPress={() => router.push("/get-started")}>Get a repair done →</TextLink>
        <TextLink onPress={() => router.push("/contractor-onboarding")}>Join as a contractor →</TextLink>
      </View>
    </AuthShell>
  );
}

// ---------------------------------------------------------------- sign in (web Login.tsx, sign-in mode)
export function SignInScreen() {
  const { t } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    if (busy) return; // the keyboard's Go key can fire while a sign-in is already running
    if (!email || !password) { setError("Please enter your email and password."); return; }
    setError(""); setNeedsConfirm(false); setNote(""); setBusy(true);
    await beginSignIn(null);
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (e) {
      await abandonSignIn();
      setBusy(false);
      const m = (e.message ?? "").toLowerCase();
      if (m.includes("not confirmed") || (e as { code?: string }).code === "email_not_confirmed") {
        setNeedsConfirm(true);
        setError("Please confirm your email before signing in. Check your inbox for the verification link.");
      } else if (m.includes("invalid login credentials")) {
        setError("That email and password don't match. Check them and try again.");
      } else {
        setError("Sign in didn't work just now. Check your connection and try again.");
      }
      return;
    }
    try { await continueAfterSignIn(); } catch { setBusy(false); setError("Something went wrong finishing your sign-in. Try again."); }
  };

  const resend = async () => {
    if (!email) { setError("Enter your email above first."); return; }
    setBusy(true); setNote("");
    // The link lands on the web until universal links go live (PLAN W3); it works from any device.
    const { error: e } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: `${WEB}/auth/callback` } });
    setBusy(false);
    if (e) setError("We couldn't resend the email just now. Try again in a minute.");
    else setNote("Confirmation email sent. Check your inbox.");
  };

  return (
    <AuthShell title="Sign in" sub="Welcome back.">
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
        autoComplete="email" textContentType="username" autoCorrect={false} returnKeyType="next" />
      <PasswordField value={password} onChangeText={setPassword} onSubmitEditing={signIn} />
      {error ? <FormNote>{error}</FormNote> : null}
      {note ? <FormNote tone="good">{note}</FormNote> : null}
      {needsConfirm && <TextLink onPress={resend}>Resend the confirmation email</TextLink>}
      <Stack>
        <Button variant="primary" full loading={busy} onPress={signIn}>Sign in</Button>
      </Stack>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: t.s2 }}>
        {/* Reset links need device-independent email links (PLAN W3) to land in the app. Until then the web resets it. */}
        <TextLink onPress={() => WebBrowser.openBrowserAsync(`${WEB}/login`)}>Forgot password?</TextLink>
        <TextLink onPress={() => router.back()}>Back</TextLink>
      </View>
    </AuthShell>
  );
}

// ---------------------------------------------------------------- two-step code (web Login.tsx otpStage)
export function VerifyCodeScreen() {
  const { t } = useTheme();
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const sent = useRef(false);

  const send = async () => {
    setErr(""); setNote(""); setBusy(true);
    const { data, error } = await supabase.rpc("mfa_request_code", { p_purpose: "login" });
    setBusy(false);
    const d = data as { ok?: boolean; reason?: string } | null;
    if (error) { setErr("Couldn't send the code. Try again in a moment."); return; }
    if (!d?.ok) { setErr(mfaReason(d?.reason)); return; }
    setNote("Code sent. Check your email.");
  };
  useEffect(() => { if (!sent.current) { sent.current = true; void send(); } }, []);

  const need = recovery ? 10 : 6;
  const verify = async () => {
    setErr(""); setNote(""); setBusy(true);
    const { data, error } = recovery
      ? await supabase.rpc("mfa_use_recovery", { p_code: code.trim() })
      : await supabase.rpc("mfa_verify", { p_code: code, p_purpose: "login" });
    const d = data as { ok?: boolean; reason?: string; attempts_left?: number } | null;
    if (error || !d?.ok) { setBusy(false); setErr(error ? "Couldn't check that code. Try again." : mfaReason(d?.reason, d?.attempts_left)); return; }
    try { await finishSignIn(); } catch { setBusy(false); setErr("Your code was accepted, but we couldn't finish signing you in. Try again."); }
  };

  return (
    <AuthShell title="One more step" sub={recovery ? "Enter one of the recovery codes you saved." : "We emailed you a 6-digit code. It expires in 10 minutes. Check your spam folder if it hasn't arrived."}>
      <Field label={recovery ? "Recovery code" : "6-digit code"} value={code} autoFocus
        onChangeText={(v) => setCode(recovery ? v.replace(/[^0-9a-zA-Z]/g, "").slice(0, 10).toUpperCase() : v.replace(/\D/g, "").slice(0, 6))}
        keyboardType={recovery ? "default" : "number-pad"} autoComplete="one-time-code" textContentType="oneTimeCode" autoCapitalize="characters" />
      {err ? <FormNote>{err}</FormNote> : null}
      {note && !recovery ? <FormNote tone="good">{note}</FormNote> : null}
      <Stack>
        <Button variant="primary" full loading={busy} disabled={code.length < need} onPress={verify}>Verify</Button>
      </Stack>
      <View style={{ flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", marginTop: t.s2 }}>
        {recovery
          ? <TextLink onPress={() => { setRecovery(false); setCode(""); setErr(""); }}>Use an emailed code</TextLink>
          : <>
              <TextLink onPress={send}>Resend code</TextLink>
              <TextLink onPress={() => { setRecovery(true); setCode(""); setErr(""); setNote(""); }}>Use a recovery code</TextLink>
            </>}
      </View>
      {/* Backing out leaves a half-finished sign-in, so it signs out (web rule). */}
      <TextLink onPress={() => void signOut()}>Cancel and sign out</TextLink>
    </AuthShell>
  );
}

// ---------------------------------------------------------------- role chooser (web AuthCallback "choose")
export function ChooseRoleScreen() {
  const { t } = useTheme();
  const [busy, setBusy] = useState<"client" | "contractor" | null>(null);
  const pick = async (role: "client" | "contractor") => {
    setBusy(role);
    const a = await readAuthUser();
    if (a.kind !== "user") { setBusy(null); go({ kind: "error", msg: "We couldn't confirm your sign-in just now. Nothing has been lost. Try again." }); return; }
    go(await chooseRole(a.userId, role));
  };
  return (
    <AuthShell title="What brings you here?" sub="Pick one. This sets up your account.">
      <Card style={{ marginTop: t.s5 }}>
        <Row icon="home" title="I need a repair" sub="Post a job and get quotes from vetted local pros" chevron onPress={() => !busy && pick("client")} />
        <Row icon="wrench" title="I'm a contractor" sub="Find jobs near you and get paid securely" chevron onPress={() => !busy && pick("contractor")} />
      </Card>
      {busy ? <Txt size={0.85} color={rgba(t.muted, 0.7)} style={{ marginTop: t.s4 }}>Setting up your account…</Txt> : null}
    </AuthShell>
  );
}

// ---------------------------------------------------------------- sign-in problems (web AuthCallback "blocked")
export function AuthProblemScreen() {
  const { t } = useTheme();
  const { msg, role, retry } = useLocalSearchParams<{ msg?: string; role?: string; retry?: string }>();
  const text = msg || "Something went wrong signing you in.";
  // The gate resumes any pending sign-in on Retry. Sign out too: a failure that isn't the
  // network (e.g. an account that never finishes setting up) must not trap anyone (review G3 F3).
  if (retry) return <DeadEnd msg={text} onRetry={() => router.replace("/")} alt={<Button variant="ghost" onPress={() => void signOut()}>Sign out</Button>} />;
  // A refusal (e.g. the one-account-type rule): retrying fails the same way, so offer the account they DO have.
  return (
    <DeadEnd retry={false} msg={text} alt={
      <View style={{ gap: t.s3, alignItems: "center" }}>
        {role ? <Button onPress={() => go(role === "contractor" ? { kind: "contractor" } : role === "admin" ? { kind: "admin" } : { kind: "client" })}>Go to my account</Button> : null}
        <Button variant="ghost" onPress={() => void signOut()}>Sign out</Button>
      </View>
    } />
  );
}

// ---------------------------------------------------------------- admin
export function AdminScreen() {
  const { t } = useTheme();
  return (
    <DeadEnd retry={false} msg="Admin tools live on the website, not in the app." alt={
      <View style={{ gap: t.s3, alignItems: "center" }}>
        <Button variant="primary" onPress={() => WebBrowser.openBrowserAsync(`${WEB}/admin-dashboard`)}>Open admin on the web</Button>
        <Button variant="ghost" onPress={() => void signOut()}>Sign out</Button>
      </View>
    } />
  );
}

// ---------------------------------------------------------------- email link (PLAN §4.4: /auth/confirm?token_hash&type)
const RECOVERY_OK = "ff_recovery_ok"; // set only by a verified recovery link; the new-password screen requires it
const RECOVERY_TTL_MS = 15 * 60 * 1000;
const transient = (e: { name?: string; status?: number } | null) =>
  !!e && (e.name === "AuthRetryableFetchError" || e.status === 0 || (typeof e.status === "number" && e.status >= 500));

export function ConfirmLinkScreen() {
  const { token_hash, type, role } = useLocalSearchParams<{ token_hash?: string; type?: string; role?: string }>();
  const [state, setState] = useState<"working" | "spent" | "offline" | "after">("working");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    let verified = false;
    (async (): Promise<"spent" | "offline" | null> => {
      const kind = type === "recovery" ? "recovery" : type === "magiclink" ? "magiclink" : type === "email_change" ? "email_change" : "signup";
      if (!token_hash) return "spent";
      const wanted = role === "contractor" || role === "client" ? role : null;
      await beginSignIn(wanted); // every verified link is a session, recovery included
      const { error } = await supabase.auth.verifyOtp({ token_hash, type: kind });
      if (error) {
        await abandonSignIn();
        return transient(error) ? "offline" : "spent"; // an offline tap didn't use the link up: say so
      }
      verified = true;
      if (!alive) return null; // cancelled while checking: the session (if any) is picked up by the gate
      if (kind === "recovery") { await kvSet(RECOVERY_OK, String(Date.now())); router.replace("/update-password"); return null; }
      await continueAfterSignIn();
      return null;
    })()
      .catch(() => (verified ? ("after" as const) : ("offline" as const))) // a used link must not be called "still works"
      .then((r) => { if (alive && r) setState(r as "spent" | "offline" | "after"); });
    return () => { alive = false; };
  }, [token_hash, type, role, attempt]);
  if (state === "offline") {
    return <DeadEnd msg="We couldn't reach Freddy Fix It to check this link. Your link still works. Check your connection, then try again."
      onRetry={() => { setState("working"); setAttempt((n) => n + 1); }} />;
  }
  if (state === "after") {
    // The link worked and you're signed in; only the next step failed. The gate picks it up from here.
    return <DeadEnd msg="You're signed in, but we couldn't finish opening your account." onRetry={() => router.replace("/")}
      alt={<Button variant="ghost" onPress={() => void signOut()}>Sign out</Button>} />;
  }
  if (state === "spent") {
    return <DeadEnd retry={false} msg="This link has expired or was already used." alt={<Button onPress={() => router.replace("/welcome")}>Go to sign in</Button>} />;
  }
  return (
    <AuthShell title="Signing you in…">
      <TextLink onPress={() => { void abandonSignIn(); router.replace("/"); }}>Cancel</TextLink>
    </AuthShell>
  );
}

// ---------------------------------------------------------------- new password (web UpdatePassword.tsx)
export function UpdatePasswordScreen() {
  const [phase, setPhase] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [breached, setBreached] = useState(false);
  const [saved, setSaved] = useState(false); // password already changed; a retry only finishes signing in
  useEffect(() => {
    // Only a recovery link verified moments ago opens this screen (review G3 #5): some other
    // signed-in session must never be the one whose password gets changed.
    (async () => {
      const at = Number((await kvGet(RECOVERY_OK)) || 0);
      if (!at || Date.now() - at > RECOVERY_TTL_MS) return "invalid" as const;
      const a = await readAuthUser();
      return a.kind === "user" ? ("ready" as const) : ("invalid" as const);
    })().catch(() => "invalid" as const).then(setPhase);
  }, []);
  const finish = async () => {
    try { await continueAfterSignIn(); } catch { setPhase("ready"); setErr("Your password is saved, but we couldn't finish signing you in. Try again."); }
  };
  const submit = async () => {
    setErr("");
    if (saved) { setPhase("done"); await finish(); return; }
    if (pw.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (pw !== pw2) { setErr("Passwords do not match."); return; }
    if (breached) { setErr("That password has appeared in public data breaches. Please choose a different one."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setErr("We couldn't update your password. The link may have expired. Request a new one."); return; }
    await kvRemove(RECOVERY_OK);
    setSaved(true);
    setPhase("done");
    notify("Password updated");
    await finish(); // same rule as web: a new password still meets the two-step code
  };
  if (phase === "checking") return <AuthShell title="Checking your link…"><View /></AuthShell>;
  if (phase === "invalid") {
    return <DeadEnd retry={false} msg="This password reset link is invalid or has expired. Request a new one." alt={<Button onPress={() => router.replace("/welcome")}>Back to sign in</Button>} />;
  }
  return (
    <AuthShell title="Set a new password" sub="Enter a new password for your account.">
      <PasswordField label="New password" value={pw} onChangeText={setPw} meter newPassword onBreachChange={setBreached} />
      <PasswordField label="Confirm new password" value={pw2} onChangeText={setPw2} newPassword onSubmitEditing={submit} />
      {err ? <FormNote>{err}</FormNote> : null}
      <Stack>
        <Button variant="primary" full loading={busy} disabled={phase === "done"} onPress={submit}>{saved ? "Continue" : "Save password"}</Button>
      </Stack>
      {/* A cold reset link is the only screen in the stack: this is the way out. */}
      <TextLink onPress={() => { void kvRemove(RECOVERY_OK); void signOut(); }}>Cancel and sign out</TextLink>
    </AuthShell>
  );
}
