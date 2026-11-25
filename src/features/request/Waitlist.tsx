// Port of web components/WaitlistForm.tsx: shown INSTEAD of a request form while the
// platform is paused or on a waitlist (acceptingRequests, synced platformStatus.ts).
// The DB trigger `enforce_platform_pause` is the real gate; this is the humane
// version of it. Anything already typed is carried in so nobody starts over.
import React, { useState } from "react";
import { View } from "react-native";
import { Button, Field, FormNote, Stack, Txt, rgba, ui, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { usePlatformStatus } from "@/lib/platformStatus";
import { validateEmail, validatePhone } from "@/lib/emailValidation";

export function WaitlistCard({ initialService = "", initialDescription = "", initialEmail = "", initialName = "", source }: {
  initialService?: string; initialDescription?: string; initialEmail?: string; initialName?: string; source: string;
}) {
  const { t } = useTheme();
  const { status } = usePlatformStatus();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState("");
  const [service, setService] = useState(initialService);
  const [description, setDescription] = useState(initialDescription);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // The email the insert actually sent: the fields stay editable while it is in flight.
  const [done, setDone] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setErr("");
    const ec = validateEmail(email);
    if (!ec.ok) { setErr(ec.suggestion ? `${ec.error} Did you mean ${ec.suggestion}?` : (ec.error || "Please enter a valid email.")); return; }
    const pc = validatePhone(phone, true);
    if (!pc.ok) { setErr(pc.error || "Please check that phone number."); return; }
    setBusy(true);
    const sent = email.trim().toLowerCase();
    try {
      const { error } = await supabase.from("waitlist").insert({
        name: name.trim() || null,
        email: sent,
        phone: phone.trim() || null,
        service: service.trim() || null,
        description: description.trim() || null,
        source,
      });
      if (error) throw error;
      setDone(sent);
    } catch (e) {
      setErr((e as { message?: string })?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ padding: t.s5, borderRadius: t.r3, backgroundColor: rgba(t.fg, 0.04), borderWidth: ui.line, borderColor: rgba(t.accentRgb, 0.3) }}>
      <Txt variant="label" size={1.6} ls={0.05} accessibilityRole="header">{status.notice.headline}</Txt>
      <Txt size={0.92} lh={1.6} color={rgba(t.muted, 0.8)} style={{ marginTop: t.s2 }}>{status.notice.body}</Txt>
      {done !== null ? (
        <FormNote tone="good">{`You're on the list. We'll email you at ${done} the moment we start taking job requests again. Nothing else will be sent to you in the meantime.`}</FormNote>
      ) : (
        <>
          <Field label="Your name (optional)" value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Alex" />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" autoCorrect={false} placeholder="you@example.com" />
          <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="403-555-0100" />
          <Field label="What do you need done? (optional)" value={service} onChangeText={setService} placeholder="Plumbing, handyman, furnace…" />
          <Field label="Anything else we should know? (optional)" value={description} onChangeText={setDescription} multiline placeholder="A short description of the job." />
          {err ? <FormNote>{err}</FormNote> : null}
          <Stack><Button variant="primary" full loading={busy} onPress={() => void submit()}>{busy ? "Adding you…" : status.notice.cta}</Button></Stack>
          <Txt size={0.78} lh={1.5} color={rgba(t.muted, 0.6)} style={{ marginTop: t.s3 }}>We’ll only use this to tell you when we reopen. You can ask us to remove you any time at hello@freddyfixit.ca.</Txt>
        </>
      )}
    </View>
  );
}
