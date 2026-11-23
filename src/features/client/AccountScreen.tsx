// Account tab (PLAN step 4.17): port of web ProfileBar + SettingsPanel for a client.
//
// Profile details are written exactly as web writes them (profiles.update of
// first_name / last_name / phone, then the `profile-updated` confirmation email whose
// failure never blocks the save). Business rules (phone validity, who may delete
// an account) are not re-invented: validatePhone is the shared web module.
//
// Deliberately NOT here yet:
//   - Delete account is step 4.18 (needs a web edge change first). Until then the row
//     opens the website's account settings and says so.
//   - "Privacy & cookies" (web analytics consent) and "Payment method" (static web copy):
//     the first is a browser-cookie control with no native counterpart, the second is a
//     claim about card storage the app doesn't verify.
import React, { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { router } from "expo-router";
import {
  Button, Card, DeadEnd, Field, FormNote, Group, Ic, Pill, Row, Screen, ScreenHeader, SkRow, Txt, notify, rgba, ui, useDelayed, useTheme,
} from "@/kit";
import { supabase } from "@/lib/supabase";
import { validatePhone } from "@/lib/emailValidation";
import { SCALE_LABELS, TEXT_SCALES, setTextScale, setTheme, type Theme } from "@/lib/theme";
import { signOut } from "@/features/auth/flow";
import { useClientData } from "./data";
import { clientNav, isPastRequest } from "./rules";
import { openOnWeb } from "./web";
import { ReferralCard } from "./ReferralCard";
import { TwoStepCard } from "./TwoStepCard";

const SUPPORT_EMAIL = "hello@freddyfixit.ca";

/** A row of mutually exclusive choices (web's `seg` buttons). 48dp targets. */
function Segmented<V extends string | number>({ options, value, onChange, label }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void; label: string }) {
  const { t } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={{ flexGrow: 1, minHeight: t.hCtl, minWidth: t.hCtl * 1.4, alignItems: "center", justifyContent: "center", paddingHorizontal: t.s3, borderRadius: t.r3,
              borderWidth: t.hairW, borderColor: on ? t.text : t.hair, backgroundColor: on ? rgba(t.fg, 0.1) : rgba(t.fg, 0.04) }}>
            <Txt variant={on ? "bodyMedium" : "body"} size={0.88} color={on ? t.text : rgba(t.muted, 0.95)}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

function ProfileCard() {
  const { t } = useTheme();
  const { state, reload } = useClientData();
  const data = state.kind === "ok" ? state.data : null;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mailed, setMailed] = useState(false);
  const [error, setError] = useState("");
  if (!data) return null;

  const p = data.profile ?? {};
  const email: string = p.email || data.email || "";
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Your profile";
  const setF = (k: keyof typeof form, v: string) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); setError(""); };

  const start = () => {
    setForm({ firstName: p.first_name ?? "", lastName: p.last_name ?? "", phone: p.phone ?? "" });
    setSaved(false); setError(""); setEditing(true);
  };

  const save = async () => {
    if (!form.firstName.trim()) { setError("First name is required."); return; }
    // Phone is required on web (2026-11-12): it is how the owner and the other side reach this person.
    const pv = validatePhone(form.phone, true);
    if (!pv.ok) { setError(pv.error ?? "Enter a valid phone number."); return; }
    setSaving(true); setError(""); setSaved(false);
    try {
      const { data: rows, error: pErr } = await supabase.from("profiles")
        .update({ first_name: form.firstName.trim(), last_name: form.lastName.trim() || null, phone: form.phone.trim() || null })
        .eq("id", data.userId).select("id");
      if (pErr) throw pErr;
      // A zero-row update throws nothing: check it, or "Saved" would be a lie.
      if (!rows || rows.length === 0) throw new Error("Could not save your changes. Please try again.");
      // Confirmation email: never let an email hiccup block the save.
      let sent = false;
      try { const { error: mailErr } = await supabase.functions.invoke("profile-updated", { body: { changed: ["name", "phone"] } }); sent = !mailErr; } catch { /* not blocking: the save already succeeded */ }
      setMailed(sent);
      setSaved(true);
      setEditing(false);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? "Could not save your changes. Please try again.");
    } finally { setSaving(false); }
  };

  return (
    <Card style={{ padding: t.s4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.s3 }}>
        <View style={{ width: t.hCtl, height: t.hCtl, borderRadius: ui.pill, alignItems: "center", justifyContent: "center", backgroundColor: rgba(t.fg, 0.08) }}>
          <Ic name="user" size={ui.icon.lg} color={t.text} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.s2, flexWrap: "wrap" }}>
            <Txt variant="bodyMedium" size={1} numberOfLines={1} style={{ flexShrink: 1 }}>{name}</Txt>
            <Pill tone="neutral">CLIENT</Pill>
          </View>
          <Txt size={0.82} color={rgba(t.muted, 0.9)} numberOfLines={2}>{email}{p.phone ? " · " + p.phone : ""}</Txt>
        </View>
      </View>
      {saved && !editing ? <FormNote tone="good">{mailed ? "Saved. We have emailed you a confirmation." : "Saved."}</FormNote> : null}
      {editing ? (
        <View>
          <Field label="First name" value={form.firstName} onChangeText={(v) => setF("firstName", v)} placeholder="First name" autoComplete="given-name" textContentType="givenName" />
          <Field label="Last name" value={form.lastName} onChangeText={(v) => setF("lastName", v)} placeholder="Last name" autoComplete="family-name" textContentType="familyName" />
          <Field label="Phone" value={form.phone} onChangeText={(v) => setF("phone", v)} placeholder="403-555-0100" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />
          <Field label="Email (sign-in, can't be changed here)" value={email} editable={false} />
          {error ? <FormNote>{error}</FormNote> : null}
          <View style={{ marginTop: t.s4, gap: t.s2 }}>
            <Button variant="primary" full loading={saving} onPress={() => void save()}>Save changes</Button>
            <Button variant="ghost" full disabled={saving} onPress={() => { setEditing(false); setError(""); }}>Cancel</Button>
          </View>
        </View>
      ) : (
        <View style={{ marginTop: t.s3 }}><Button onPress={start}>Edit profile</Button></View>
      )}
    </Card>
  );
}

export function AccountScreen() {
  const { t, scheme, scale } = useTheme();
  const { state, reload } = useClientData();
  const showSkeleton = useDelayed();

  if (state.kind === "error") {
    return <DeadEnd msg="We couldn't load your account. Check your connection, then try again." onRetry={() => void reload()} />;
  }
  if (state.kind === "loading") {
    return (
      <Screen>
        <ScreenHeader title="Account" back={false} />
        {showSkeleton ? <View style={{ paddingTop: t.s6, gap: t.s4 }}><SkRow /><SkRow /><SkRow /></View> : null}
      </Screen>
    );
  }

  const { pros, plans, requests } = state.data;
  // Recurring and History are not tabs on a phone: they are rows here, shown by the same counts as web's nav.
  const nav = clientNav({ pros: pros.length, plans: plans.length, past: requests.filter(isPastRequest).length });

  const mail = () => {
    const subject = encodeURIComponent("Bug report: Freddy Fix It");
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(() => notify(`Couldn't open your email app. Write to ${SUPPORT_EMAIL}.`, "danger"));
  };

  return (
    <Screen onRefresh={reload}>
      <ScreenHeader title="Account" back={false} />
      <ProfileCard />

      {nav.history || nav.recurring ? (
        <Group>
          <Card>
            {nav.history ? <Row icon="clock" tone="neutral" title="History" sub="Finished and cancelled requests" chevron onPress={() => router.push("/client/history")} /> : null}
            {nav.recurring ? <Row icon="repeat" tone="neutral" title="Recurring" sub="Your repeat services" chevron onPress={() => router.push("/client/recurring")} /> : null}
          </Card>
        </Group>
      ) : null}

      <Group label="APPEARANCE">
        <Card style={{ padding: t.s4 }}>
          <Segmented<Theme> label="Theme" value={scheme} onChange={setTheme} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} />
        </Card>
      </Group>

      <Group label="TEXT SIZE">
        <Card style={{ padding: t.s4, gap: t.s3 }}>
          <Segmented<number> label="Text size" value={scale} onChange={setTextScale} options={TEXT_SCALES.map((v) => ({ value: v, label: SCALE_LABELS[v] }))} />
          <Txt size={0.82} color={rgba(t.muted, 0.9)}>Adjusts text across the app. Current: {SCALE_LABELS[scale]}</Txt>
        </Card>
      </Group>

      <Group><ReferralCard /></Group>
      <Group><TwoStepCard /></Group>

      <Group label="SUPPORT">
        <Card>
          <Row icon="info" tone="neutral" title="Help and report a problem" sub={`Found something broken? Email ${SUPPORT_EMAIL}`} chevron onPress={mail} />
        </Card>
      </Group>

      <Group label="LEGAL">
        <Card>
          <Row icon="file" tone="neutral" title="User Agreement" sub="Opens on freddyfixit.ca" chevron onPress={() => openOnWeb("/user-agreement")} />
          <Row icon="file" tone="neutral" title="Privacy Policy" sub="Opens on freddyfixit.ca" chevron onPress={() => openOnWeb("/privacy-policy")} />
        </Card>
      </Group>

      <Group label="ACCOUNT">
        <Card>
          {/* Step 4.18 brings deletion into the app (it needs a web edge change first). Until then the website does it. */}
          <Row icon="trash" tone="neutral" title="Delete account on the website" sub="Deleting your account is done on freddyfixit.ca for now. Opens your account settings there." chevron
            onPress={() => openOnWeb("/client-dashboard?tab=settings")} />
        </Card>
        <View style={{ marginTop: t.s4 }}>
          <Button variant="ghost" full onPress={() => void signOut()}>Sign out</Button>
        </View>
      </Group>
    </Screen>
  );
}
