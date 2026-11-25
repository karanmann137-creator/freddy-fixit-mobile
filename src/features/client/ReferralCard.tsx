// Referral card: port of web components/ReferralCard.tsx. My code from get_my_referral,
// share it, and the "enter a friend's code" box. The box also READS-AND-CLEARS the code
// the server refused at signup (takeReferralError): the Requests tab's attention row
// sends people here, so this is where that explanation must appear, once.
//
// Every rule (own code, already referred, retired, in use) lives in apply_referral_code;
// this only turns its reasons into English. A failed read says so and offers a retry:
// every client has a code, so "nothing" would be a lie.
import React, { useEffect, useState } from "react";
import { Share, View } from "react-native";
import { Button, Card, Field, Txt, rgba, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { referralReasonText, takeReferralError } from "@/lib/referralCode";

type Msg = { ok: boolean; text: string } | null;
type Read = { nonce: number; res: { ok: true; referral: any } | { ok: false } };

export function ReferralCard() {
  const { t } = useTheme();
  const [read, setRead] = useState<Read | null>(null);
  const [nonce, setNonce] = useState(0);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    let stale = false;
    void (async () => {
      let res: Read["res"];
      try {
        const { data, error } = await supabase.rpc("get_my_referral");
        res = error ? { ok: false } : { ok: true, referral: data ?? null };
      } catch { res = { ok: false }; }
      if (!stale) setRead({ nonce, res });
    })();
    return () => { stale = true; };
  }, [nonce]);

  // Read-and-clear once on mount, so the refusal shows once and not on every visit.
  useEffect(() => {
    void takeReferralError().then((s) => { if (s) setMsg({ ok: false, text: s }); }).catch(() => undefined);
  }, []);

  const cur = read && read.nonce === nonce ? read.res : null;
  const shell = (children: React.ReactNode) => <Card style={{ padding: t.s4 }}>{children}</Card>;
  const heading = (text: string) => <Txt variant="label" size={0.78} color={rgba(t.muted, 0.78)} ls={0.11} accessibilityRole="header" style={{ marginBottom: t.s3 }}>{text}</Txt>;
  const para = (text: React.ReactNode) => <Txt size={0.88} color={rgba(t.muted, 0.95)} lh={1.5}>{text}</Txt>;
  const msgLine = msg ? <Txt size={0.85} lh={1.5} color={msg.ok ? t.success : t.danger} accessibilityLiveRegion="polite" style={{ marginTop: t.s3 }}>{msg.text}</Txt> : null;

  if (!cur) return shell(<>{heading("INVITE A FRIEND")}{para("Loading…")}{msgLine}</>);
  if (!cur.ok) {
    return shell(<>
      {heading("INVITE A FRIEND")}
      {para("We couldn't load your referral code just now.")}
      {msgLine}
      <View style={{ marginTop: t.s3 }}><Button onPress={() => setNonce((n) => n + 1)}>Try again</Button></View>
    </>);
  }

  const referral = cur.referral;
  if (!referral?.code) return msgLine ? shell(<>{heading("INVITE A FRIEND")}{msgLine}</>) : null;

  const status = String(referral.code_status ?? "active");
  const retired = status === "retired";
  const inUse = status === "in_use";
  let rewardedOn = "";
  try {
    if (referral.rewarded_at) rewardedOn = new Date(referral.rewarded_at).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" });
  } catch { /* the sentence just omits the date */ }

  const share = async () => {
    const code = referral.code;
    try {
      await Share.share({ message: "Get your first Freddy Fix It service fee waived with my code " + code + ": https://freddyfixit.ca/?ref=" + code });
    } catch { setMsg({ ok: false, text: "Couldn't open sharing. Your code is " + code + ", shown above." }); }
  };

  const apply = async () => {
    const code = input.trim().toUpperCase();
    if (!code || busy) return;
    setBusy(true); setMsg(null);
    try {
      const { data, error } = await supabase.rpc("apply_referral_code", { p_code: code });
      if (error) throw error;
      const res = data as { ok?: boolean; reason?: string } | null;
      if (res?.ok === true) {
        setInput("");
        setMsg({ ok: true, text: "Code applied. Your service fee is waived on your first job." });
        setNonce((n) => n + 1); // re-read so the entry box goes away
      } else {
        setMsg({ ok: false, text: referralReasonText(String(res?.reason ?? "")) });
      }
    } catch {
      setMsg({ ok: false, text: "Couldn't apply that code just now. Please try again." });
    } finally { setBusy(false); }
  };

  return shell(<>
    {heading(retired ? "FRIEND REFERRED" : "INVITE A FRIEND, THEY SAVE")}
    {para(retired
      ? `You referred a friend and they booked their first job${rewardedOn ? " on " + rewardedOn : ""}. We covered their service fee. Your code has done its job, so it's retired. Thanks for the introduction.`
      : inUse
        ? "A friend has your code right now. Each code is good for one friend, so it's on hold until they book. If they haven't within 30 days it frees up on its own."
        : "Your code waives the service fee on a friend's first job. It's good for one friend. Once they book, the code retires and you keep the badge.")}

    {/* Sharing a code that will be refused is a dead end the sharer can't see, so it is hidden when retired or on hold. */}
    {retired ? null : (
      <View style={{ marginTop: t.s4, alignItems: "center", gap: t.s3 }}>
        <View style={{ paddingHorizontal: t.s4, paddingVertical: t.s2, borderWidth: t.hairW, borderStyle: "dashed", borderColor: rgba(t.fg, 0.25), borderRadius: t.r3, opacity: inUse ? 0.45 : 1 }}>
          <Txt selectable variant="label" size={1.8} ls={0.12} color={t.text}>{referral.code}</Txt>
        </View>
        {inUse ? <Txt size={0.78} color={rgba(t.muted, 0.9)}>On hold with a friend</Txt> : <Button onPress={() => void share()}>Share invite link</Button>}
      </View>
    )}

    {/* Only for someone who hasn't been referred: apply_referral_code refuses a second code. */}
    {!referral.i_was_referred ? (
      <View style={{ marginTop: t.s4, paddingTop: t.s3, borderTopWidth: t.hairW, borderTopColor: t.hair }}>
        {para("Got a code from a friend? Enter it before your first job and we'll waive your service fee.")}
        <Field label="Friend's code" value={input} onChangeText={(v) => { setInput(v.toUpperCase()); setMsg(null); }}
          autoCapitalize="characters" autoCorrect={false} maxLength={24} placeholder="Friend's code"
          onSubmitEditing={() => void apply()} />
        <View style={{ marginTop: t.s3 }}>
          <Button loading={busy} disabled={!input.trim()} onPress={() => void apply()}>Apply code</Button>
        </View>
      </View>
    ) : null}
    {msgLine}
  </>);
}
