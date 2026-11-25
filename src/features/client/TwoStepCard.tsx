// Two-step sign-in panel: port of web components/TwoStepPanel.tsx onto the same
// mfa_* RPCs and the shared reason map in src/lib/mfa.ts. Every write goes through an
// RPC that has verified a code; nothing here decides anything.
//
// Native differences, both forced by the platform: there is no file download or
// clipboard module in the app, so the one-time recovery codes are handed to the
// system share sheet (Notes, Messages, a password manager, Save to Files).
// "Done" unlocks only once the share sheet has completed, as web unlocks it after
// Download/Copy. A failed status read says so and offers a retry; it never says "off".
import React, { useEffect, useRef, useState } from "react";
import { Share, View } from "react-native";
import { Button, Card, Pill, Txt, rgba, useTheme, Field, FormNote } from "@/kit";
import { supabase } from "@/lib/supabase";
import { mfaReason, type MfaStatus } from "@/lib/mfa";
import { openOnWeb } from "./web";

type MfaResult = { ok?: boolean; reason?: string; attempts_left?: number; recovery_codes?: string[] };
type Stage = "idle" | "code" | "codes" | "off-code";
type Read = { nonce: number; res: { ok: true; st: MfaStatus } | { ok: false } };

export function TwoStepCard() {
  const { t } = useTheme();
  const [read, setRead] = useState<Read | null>(null);
  const [nonce, setNonce] = useState(0);
  const [stage, setStage] = useState<Stage>("idle");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  // One verification in flight at a time: the keyboard's submit bypasses the button's loading state.
  const verifying = useRef(false);

  useEffect(() => {
    let stale = false;
    void (async () => {
      let res: Read["res"];
      try {
        const { data, error } = await supabase.rpc("mfa_status");
        res = error || !data ? { ok: false } : { ok: true, st: data as MfaStatus };
      } catch { res = { ok: false }; }
      if (!stale) setRead({ nonce, res });
    })();
    return () => { stale = true; };
  }, [nonce]);
  const reread = () => setNonce((n) => n + 1);

  const cur = read && read.nonce === nonce ? read.res : null;
  const lastGood = read?.res.ok ? read.res.st : null;

  const title = (st: MfaStatus | null) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: t.s2, marginBottom: t.s3 }}>
      <Txt variant="label" size={0.78} color={rgba(t.muted, 0.78)} ls={0.11} accessibilityRole="header">TWO-STEP SIGN-IN</Txt>
      {st ? <Pill tone={st.enabled ? "good" : "neutral"}>{st.enabled ? "ON" : "OFF"}</Pill> : null}
    </View>
  );
  const body = (text: React.ReactNode) => <Txt size={0.88} color={rgba(t.muted, 0.95)} lh={1.5} style={{ marginBottom: t.s3 }}>{text}</Txt>;

  // Codes the server has already issued are shown whatever the status refresh says:
  // they can never be shown again (CodeRabbit #6).
  const codesPending = stage === "codes";
  // A failed read is not "two-step is off": that would invite turning it on again and wiping the recovery codes.
  if (!codesPending && read && !read.res.ok && !lastGood) {
    return (
      <Card style={{ padding: t.s4 }}>
        {title(null)}
        {body("We couldn't check your two-step setting just now. Your current setting hasn't changed.")}
        <View style={{ gap: t.s2 }}>
          <Button onPress={reread}>Try again</Button>
          <Button variant="ghost" onPress={() => openOnWeb("/client-dashboard?tab=settings")}>Open it on freddyfixit.ca</Button>
        </View>
      </Card>
    );
  }
  const st = cur && cur.ok ? cur.st : lastGood;
  if (!codesPending && !st) {
    return <Card style={{ padding: t.s4 }}>{title(null)}{body("Loading…")}</Card>;
  }

  async function requestCode(purpose: "enroll" | "disable") {
    setErr(""); setNote(""); setBusy(true);
    try {
      const { data: raw, error } = await supabase.rpc("mfa_request_code", { p_purpose: purpose });
      const data = raw as MfaResult | null;
      if (error) throw error;
      if (!data?.ok) { setErr(mfaReason(data?.reason)); return; }
      setNote("Code sent. Check your email.");
      setStage(purpose === "enroll" ? "code" : "off-code");
      setCode("");
    } catch (e: any) {
      setErr(e?.message || "Couldn't send the code. Try again in a moment.");
    } finally { setBusy(false); }
  }

  async function verifyEnroll() {
    if (verifying.current || code.length !== 6) return;
    verifying.current = true;
    setErr(""); setNote(""); setBusy(true);
    try {
      const { data: raw, error } = await supabase.rpc("mfa_verify", { p_code: code, p_purpose: "enroll" });
      const data = raw as MfaResult | null;
      if (error) throw error;
      if (!data?.ok) { setErr(mfaReason(data?.reason, data?.attempts_left)); return; }
      setRecovery(data.recovery_codes ?? []);
      setSaved(false);
      setStage("codes");
      reread();
    } catch (e: any) {
      setErr(e?.message || "Couldn't check that code.");
    } finally { verifying.current = false; setBusy(false); }
  }

  async function doDisable() {
    setBusy(true);
    try {
      const { data: raw, error } = await supabase.rpc("mfa_disable");
      const data = raw as MfaResult | null;
      if (error) throw error;
      if (!data?.ok) { setErr(mfaReason(data?.reason)); return; }
      setStage("idle"); setCode(""); setRecovery([]);
      setNote("Two-step sign-in is off.");
      reread();
    } catch (e: any) {
      setErr(e?.message || "Couldn't turn it off.");
    } finally { setBusy(false); }
  }

  async function turnOff() {
    setErr(""); setNote("");
    // Turning it off must itself pass the factor, or a stolen session just switches it off.
    if (!st?.verified_recently) { await requestCode("disable"); return; }
    await doDisable();
  }

  async function verifyThenDisable() {
    if (verifying.current || code.length !== 6) return;
    verifying.current = true;
    setErr(""); setBusy(true);
    try {
      const { data: raw, error } = await supabase.rpc("mfa_verify", { p_code: code, p_purpose: "disable" });
      const data = raw as MfaResult | null;
      if (error) throw error;
      if (!data?.ok) { setErr(mfaReason(data?.reason, data?.attempts_left)); return; }
      await doDisable();
    } catch (e: any) {
      setErr(e?.message || "Couldn't check that code.");
    } finally { verifying.current = false; setBusy(false); }
  }

  async function shareCodes() {
    const text = "Freddy Fix It recovery codes\n\nEach code works once. Use one to sign in if you can't get to your email. Keep this somewhere only you can reach.\n\n" + recovery.join("\n");
    try {
      const r = await Share.share({ message: text });
      if (r.action !== Share.dismissedAction) setSaved(true);
    } catch { setErr("We couldn't open the share sheet. Write the codes down from the screen instead."); setSaved(true); }
  }

  return (
    <Card style={{ padding: t.s4 }}>
      {title(st)}
      {err ? <FormNote>{err}</FormNote> : null}
      {note ? <FormNote tone="good">{note}</FormNote> : null}
      <View style={{ height: t.s3 }} />

      {stage === "codes" ? (
        <>
          {body("Two-step sign-in is on. Save these recovery codes now. This is the only time they are shown. Each one works once, and they get you in if you can't reach your email.")}
          <View style={{ flexDirection: "row", flexWrap: "wrap", padding: t.s3, borderRadius: t.r2, backgroundColor: rgba(t.fg, 0.06), marginBottom: t.s3 }}>
            {recovery.map((c) => (
              <View key={c} style={{ width: "50%", paddingVertical: t.s1 }}>
                <Txt selectable variant="label" size={0.95} ls={0.08} style={{ textAlign: "center" }}>{c}</Txt>
              </View>
            ))}
          </View>
          <View style={{ gap: t.s2 }}>
            <Button full onPress={() => void shareCodes()}>Save or share the codes</Button>
            <Button full variant="ghost" disabled={!saved} onPress={() => { setStage("idle"); setRecovery([]); setNote(""); }}>
              {saved ? "Done, I've saved them" : "Save or share them first"}
            </Button>
          </View>
        </>
      ) : stage === "code" || stage === "off-code" ? (
        <>
          {body((stage === "code"
            ? "We emailed you a 6-digit code. Enter it to finish turning two-step on."
            : "We emailed you a 6-digit code. Enter it to turn two-step off.") + " It expires in 10 minutes.")}
          <Field label="6-digit code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6} placeholder="000000"
            onSubmitEditing={() => void (stage === "code" ? verifyEnroll() : verifyThenDisable())} />
          <View style={{ gap: t.s2, marginTop: t.s4 }}>
            <Button full loading={busy} disabled={code.length !== 6} onPress={() => void (stage === "code" ? verifyEnroll() : verifyThenDisable())}>Verify</Button>
            <Button full variant="ghost" disabled={busy} onPress={() => void requestCode(stage === "code" ? "enroll" : "disable")}>Send a new code</Button>
            <Button full variant="ghost" onPress={() => { setStage("idle"); setCode(""); setErr(""); setNote(""); }}>Cancel</Button>
          </View>
        </>
      ) : st?.enabled ? (
        <>
          {body("When you sign in, we'll email you a 6-digit code. Someone who learns your password still can't get in without your email.")}
          {body(`${st.recovery_left} of your recovery codes are unused.` + (st.recovery_left <= 2 ? " Turn two-step off and on again to get a fresh set." : ""))}
          <Button full loading={busy} onPress={() => void turnOff()}>Turn off two-step sign-in</Button>
        </>
      ) : (
        <>
          {body("Add a second step at sign-in: after your password, we email you a 6-digit code. It means a stolen password on its own isn't enough to get into your account.")}
          {body("You'll get 10 single-use recovery codes to save, so losing access to your email doesn't lock you out. If you lose those too, email hello@freddyfixit.ca and we can switch it off for you.")}
          <Button full loading={busy} onPress={() => void requestCode("enroll")}>Turn on two-step sign-in</Button>
        </>
      )}
    </Card>
  );
}
