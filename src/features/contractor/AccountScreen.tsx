// Account / Profile tab (PLAN steps 5.4 + 5.3 handoff): port of web ContractorProfileTab
// + ProfileBar (role="contractor") + the client Account rows.
//
// Everything is written exactly as web writes it, with one addition web lacks: every
// update asks for the row back, because a zero-row update throws nothing and "Saved"
// would be a lie.
//
// Deliberately NOT here (each is a web prerequisite or a later step, see the PR notes):
//   - The profile-completion editor (photo, area, trade, credentials, documents) and the
//     gap list. contractorGaps / GAP_ANCHORS / WORK_TYPES live in web page and component
//     files (pages/contractor/shared.tsx, components/ContractorProfileCompletion.tsx), not
//     in a synced src/lib module, so copying them here would be a second copy of a rule.
//     Until they move to src/lib the row below opens the website, which can answer.
//   - Payout setup (Stripe Connect, step 5.3) needs web change E2: a website handoff.
//   - Delete account: website handoff (needs a web edge change, step 4.18).
import React, { useState } from "react";
import { Image, Linking, Pressable, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { randomUUID } from "expo-crypto";
import {
  Button, Card, DeadEnd, Field, FormNote, Group, Ic, Pill, Row, Screen, ScreenHeader, SkRow, Txt, askConfirm, notify, rgba, ui, useDelayed, useTheme,
} from "@/kit";
import { supabase } from "@/lib/supabase";
import type { TablesUpdate } from "@/lib/database.types";
import { validatePhone } from "@/lib/emailValidation";
import { AVAIL_DAYS, TIME_OPTIONS, WEEKDAYS, readAvailability } from "@/lib/availability";
import { SCALE_LABELS, TEXT_SCALES, setTextScale, setTheme, type Theme } from "@/lib/theme";
import { signOut } from "@/features/auth/flow";
import { uploadImage } from "@/platform/upload";
import { openOnWeb } from "@/features/client/web";
import { TwoStepCard } from "@/features/client/TwoStepCard";
import { useContractorData } from "./data";
import { contractorNav, navCounts } from "./rules";
import { Segmented } from "./Segmented";

const SUPPORT_EMAIL = "hello@freddyfixit.ca";
const PROFILE_ON_WEB = "/contractor-dashboard?tab=profile";

/** Surface the reason of a failed write in words fit for the person. */
const reasonOf = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

type Ctx = { userId: string; contractor: any; reload: () => Promise<void> };

/** contractors.update(patch) for the signed-in pro, zero-row checked. Throws with words to show. */
async function updateContractor(userId: string, patch: TablesUpdate<"contractors">) {
  const { data: rows, error } = await supabase.from("contractors").update(patch).eq("id", userId).select("id");
  if (error) throw error;
  if (!rows || rows.length === 0) throw new Error("Could not save your changes. Please try again.");
}

// ── Profile (web ProfileBar, role="contractor") ──────────────────────────────
function ProfileCard({ profile, contractor, email, userId, reload }: { profile: any; contractor: any; email: string; userId: string; reload: () => Promise<void> }) {
  const { t } = useTheme();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", companyName: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mailed, setMailed] = useState(false);
  const [error, setError] = useState("");

  const p = profile ?? {};
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Your profile";
  const setF = (k: keyof typeof form, v: string) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); setError(""); };

  const start = () => {
    setForm({ firstName: p.first_name ?? "", lastName: p.last_name ?? "", phone: p.phone ?? "", companyName: contractor?.company_name ?? "" });
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
        .eq("id", userId).select("id");
      if (pErr) throw pErr;
      if (!rows || rows.length === 0) throw new Error("Could not save your changes. Please try again.");
      // Web also writes work_type here; the trade picker is a web prerequisite (see header), so it is left untouched.
      await updateContractor(userId, { company_name: form.companyName.trim() || null });
      // Confirmation email: never let an email hiccup block the save.
      let sent = false;
      try { const { error: mailErr } = await supabase.functions.invoke("profile-updated", { body: { changed: ["name", "phone", "company"] } }); sent = !mailErr; } catch { /* the save already succeeded */ }
      setMailed(sent); setSaved(true); setEditing(false);
      await reload();
    } catch (e) {
      setError(reasonOf(e, "Could not save your changes. Please try again."));
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
            <Pill tone="neutral">CONTRACTOR</Pill>
          </View>
          <Txt size={0.82} color={rgba(t.muted, 0.9)} numberOfLines={2}>{(p.email || email)}{p.phone ? " · " + p.phone : ""}</Txt>
          {contractor?.company_name ? <Txt size={0.82} color={rgba(t.muted, 0.9)} numberOfLines={1}>{contractor.company_name}</Txt> : null}
        </View>
      </View>
      {saved && !editing ? <FormNote tone="good">{mailed ? "Saved. We have emailed you a confirmation." : "Saved."}</FormNote> : null}
      {editing ? (
        <View>
          <Field label="First name" value={form.firstName} onChangeText={(v) => setF("firstName", v)} placeholder="First name" autoComplete="given-name" textContentType="givenName" />
          <Field label="Last name" value={form.lastName} onChangeText={(v) => setF("lastName", v)} placeholder="Last name" autoComplete="family-name" textContentType="familyName" />
          <Field label="Phone" value={form.phone} onChangeText={(v) => setF("phone", v)} placeholder="403-555-0100" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />
          <Field label="Company (optional)" value={form.companyName} onChangeText={(v) => setF("companyName", v)} placeholder="Company name" />
          <Field label="Email (sign-in, can't be changed here)" value={p.email || email} editable={false} />
          {error ? <FormNote>{error}</FormNote> : null}
          <View style={{ marginTop: t.s4, gap: t.s2 }}>
            <Button variant="secondary" full loading={saving} onPress={() => void save()}>Save changes</Button>
            <Button variant="ghost" full disabled={saving} onPress={() => { setEditing(false); setError(""); }}>Cancel</Button>
          </View>
        </View>
      ) : (
        <View style={{ marginTop: t.s3 }}><Button onPress={start}>Edit profile</Button></View>
      )}
    </Card>
  );
}

// ── Facts (web "YOUR PROFILE") + the opt-in to jobs outside the listed trades ──
function FactsCard({ contractor, userId }: { contractor: any; userId: string }) {
  const { t } = useTheme();
  const specialties: string[] = Array.isArray(contractor?.specialties) ? contractor.specialties : [];
  const [other, setOther] = useState(specialties.includes("Other"));
  const [busy, setBusy] = useState(false);
  const area: string[] = Array.isArray(contractor?.service_area) ? contractor.service_area : [];

  // Stored as the "Other" specialty, which service_specialty_map maps "Other" requests to (web).
  const toggleOther = async (on: boolean) => {
    const prev = other;
    const next = on ? Array.from(new Set([...specialties, "Other"])) : specialties.filter((s) => s !== "Other");
    setOther(on); setBusy(true);
    try { await updateContractor(userId, { specialties: next }); }
    catch { setOther(prev); notify("Couldn't save that. Please try again.", "danger"); }
    finally { setBusy(false); }
  };

  const facts: [string, string][] = [
    ["Experience", `${contractor?.years_of_experience ?? 0} years`],
    ["Rating", contractor?.rating ? String(contractor.rating) : "No ratings"],
    ["Status", String(contractor?.status ?? "—")],
  ];
  return (
    <Card style={{ padding: t.s4, gap: t.s3 }}>
      {facts.map(([l, v]) => (
        <View key={l} style={{ flexDirection: "row", justifyContent: "space-between", gap: t.s3 }}>
          <Txt variant="label" size={0.78} color={rgba(t.muted, 0.7)}>{l.toUpperCase()}</Txt>
          <Txt size={0.9} style={{ flexShrink: 1, textAlign: "right" }}>{v}</Txt>
        </View>
      ))}
      {specialties.length > 0 ? (
        <View style={{ gap: t.s2 }}>
          <Txt variant="label" size={0.78} color={rgba(t.muted, 0.7)}>SPECIALTIES</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2 }}>
            {specialties.filter((s) => s !== "Other").map((s) => <Pill key={s} tone="neutral">{s}</Pill>)}
          </View>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: other, disabled: busy }} disabled={busy} onPress={() => void toggleOther(!other)}
            style={{ flexDirection: "row", alignItems: "center", gap: t.s3, minHeight: t.hCtl }}>
            <View style={{ width: ui.tick, height: ui.tick, borderRadius: t.r1, borderWidth: t.hairW, borderColor: other ? t.text : t.hair, alignItems: "center", justifyContent: "center", backgroundColor: other ? rgba(t.fg, 0.1) : "transparent" }}>
              {other ? <Ic name="check" size={ui.icon.sm} color={t.text} /> : null}
            </View>
            <Txt size={0.9} style={{ flex: 1 }}>Also send me jobs outside my specialties</Txt>
          </Pressable>
        </View>
      ) : null}
      {area.length > 0 ? (
        <View style={{ gap: t.s2 }}>
          <Txt variant="label" size={0.78} color={rgba(t.muted, 0.7)}>SERVICE AREA</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2 }}>
            {area.map((z) => <Pill key={z} tone="neutral">{z}</Pill>)}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

// ── Pricing & tax details (web savePricing) ──────────────────────────────────
function PricingCard({ contractor, userId, reload }: Ctx) {
  const { t } = useTheme();
  const [form, setForm] = useState({
    hourly: contractor?.hourly_rate != null ? String(contractor.hourly_rate) : "",
    callout: contractor?.min_callout != null ? String(contractor.min_callout) : "",
    gst: contractor?.gst_number ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setF = (k: keyof typeof form, v: string) => { setForm((f) => ({ ...f, [k]: v })); setError(""); };

  const save = async () => {
    const hourly = form.hourly ? Number(form.hourly) : null;
    const callout = form.callout ? Number(form.callout) : null;
    if ((hourly != null && (!Number.isFinite(hourly) || hourly < 0)) || (callout != null && (!Number.isFinite(callout) || callout < 0))) { setError("Enter amounts as plain numbers, like 85."); return; }
    setBusy(true); setError("");
    try {
      // gst_number is free text and is PRINTED, never computed with: trimmed, nulled when blank, else stored as typed (web).
      await updateContractor(userId, { hourly_rate: hourly, min_callout: callout, gst_number: form.gst.trim() || null });
      notify("Saved.", "good");
      await reload();
    } catch (e) { setError(reasonOf(e, "Couldn't save your details. Please try again.")); }
    finally { setBusy(false); }
  };

  return (
    <Card style={{ padding: t.s4 }}>
      <Txt size={0.85} color={rgba(t.muted, 0.8)} lh={1.5}>Set these once and they pre-fill your call-out fee when you send an estimate. Clients don&apos;t see these numbers.</Txt>
      <Field label="Hourly rate ($)" value={form.hourly} onChangeText={(v) => setF("hourly", v)} placeholder="e.g. 85" keyboardType="decimal-pad" />
      <Field label="Minimum call-out ($)" value={form.callout} onChangeText={(v) => setF("callout", v)} placeholder="e.g. 120" keyboardType="decimal-pad" />
      <Field label="GST / business number (optional)" value={form.gst} onChangeText={(v) => setF("gst", v)} placeholder="e.g. 123456789RT0001" autoCapitalize="characters"
        hint="Printed on your payout statements and earnings summaries only. Freddy Fix It doesn't charge or remit GST on your behalf: talk to your accountant about your own obligations." />
      {error ? <FormNote>{error}</FormNote> : null}
      <View style={{ marginTop: t.s4 }}><Button variant="secondary" full loading={busy} onPress={() => void save()}>Save details</Button></View>
    </Card>
  );
}

// ── Google reviews link + portfolio (web "PORTFOLIO & REVIEWS") ──────────────
function PortfolioCard({ contractor, portfolio, portfolioFailed, userId, reload }: Ctx & { portfolio: any[]; portfolioFailed: boolean }) {
  const { t } = useTheme();
  const [url, setUrl] = useState<string>(contractor?.google_reviews_url ?? "");
  const [savingUrl, setSavingUrl] = useState(false);
  const [urlMsg, setUrlMsg] = useState<{ tone: "good" | "danger"; text: string } | null>(null);
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const saveUrl = async () => {
    setSavingUrl(true); setUrlMsg(null);
    try {
      await updateContractor(userId, { google_reviews_url: url.trim() || null });
      setUrlMsg({ tone: "good", text: "Saved." });
      await reload();
    } catch (e) { setUrlMsg({ tone: "danger", text: reasonOf(e, "Couldn't save the link. Please try again.") }); }
    finally { setSavingUrl(false); }
  };

  const choose = async () => {
    setAddError("");
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
      if (r.canceled) return;
      const a = r.assets?.[0];
      if (a) setAsset(a);
    } catch { setAddError("Couldn't open your photos. Try again."); }
  };

  const add = async () => {
    if (!asset) { setAddError("Choose a photo first."); return; }
    setAdding(true); setAddError("");
    let path = "";
    try {
      // compressImage runs inside uploadImage with the `photo` profile (web: compressImage(file, "photo")).
      const up = await uploadImage({ bucket: "portfolio-photos", basePath: `${userId}/${randomUUID()}`, asset: { uri: asset.uri, mimeType: asset.mimeType ?? null, fileName: asset.fileName ?? null, width: asset.width, height: asset.height }, profile: "photo" });
      if (!up.ok) { setAddError(up.message); return; }
      path = up.path;
      const { data: row, error } = await supabase.from("portfolio_items")
        .insert({ contractor_id: userId, title: title.trim() || null, description: desc.trim() || null, photo_path: path })
        .select("id").maybeSingle();
      if (error) throw error;
      if (!row) throw new Error("Couldn't add that photo. Please try again.");
      setAsset(null); setTitle(""); setDesc("");
      await reload();
    } catch (e) {
      // The photo was uploaded but the row was not written: don't leave an orphan file behind (best effort).
      if (path) void supabase.storage.from("portfolio-photos").remove([path]).catch(() => {});
      setAddError(reasonOf(e, "Couldn't add that photo. Please try again."));
    } finally { setAdding(false); }
  };

  const remove = async (item: any) => {
    const ok = await askConfirm({ title: "Remove this photo?", message: "It will no longer show on your profile.", confirmLabel: "Remove", danger: true });
    if (!ok) return;
    const { data: rows, error } = await supabase.from("portfolio_items").delete().eq("id", item.id).select("id");
    if (error || !rows || rows.length === 0) { notify("Couldn't remove that photo. Please try again.", "danger"); return; }
    if (item.photo_path) void supabase.storage.from("portfolio-photos").remove([item.photo_path]).catch(() => {});
    await reload();
  };

  const pfUrl = (path: string) => supabase.storage.from("portfolio-photos").getPublicUrl(path).data.publicUrl;

  return (
    <Card style={{ padding: t.s4 }}>
      <Field label="Google reviews link" value={url} onChangeText={(v) => { setUrl(v); setUrlMsg(null); }} placeholder="https://g.page/your-business/review" autoCapitalize="none" keyboardType="url" />
      {urlMsg ? <FormNote tone={urlMsg.tone}>{urlMsg.text}</FormNote> : null}
      <View style={{ marginTop: t.s3 }}><Button loading={savingUrl} onPress={() => void saveUrl()}>Save link</Button></View>

      <View style={{ marginTop: t.s6 }}>
        <Txt variant="label" size={0.78} color={rgba(t.muted, 0.7)}>PAST WORK PHOTOS</Txt>
        {portfolioFailed ? (
          <FormNote>We couldn&apos;t load your portfolio just now. Pull down to try again.</FormNote>
        ) : portfolio.length === 0 ? (
          <Txt size={0.85} color={rgba(t.muted, 0.75)} style={{ marginTop: t.s2 }}>No portfolio items yet. Add your best past jobs below.</Txt>
        ) : (
          <View style={{ marginTop: t.s3, gap: t.s3 }}>
            {portfolio.map((item) => (
              <View key={item.id} style={{ flexDirection: "row", gap: t.s3, alignItems: "center", borderWidth: t.hairW, borderColor: t.hair, borderRadius: t.r3, overflow: "hidden", backgroundColor: rgba(t.fg, 0.04) }}>
                {item.photo_path ? <Image source={{ uri: pfUrl(item.photo_path) }} accessibilityIgnoresInvertColors accessibilityLabel={item.title || "Past job"} resizeMode="cover" style={{ width: t.hCtl * 2, height: t.hCtl * 2 }} /> : null}
                <View style={{ flex: 1, paddingVertical: t.s2, paddingRight: t.s2 }}>
                  {item.title ? <Txt variant="bodyMedium" size={0.88}>{item.title}</Txt> : null}
                  {item.description ? <Txt size={0.78} color={rgba(t.muted, 0.8)} numberOfLines={2}>{item.description}</Txt> : null}
                  <Pressable accessibilityRole="button" accessibilityLabel={"Remove " + (item.title || "this photo")} onPress={() => void remove(item)} style={{ minHeight: t.hCtl, justifyContent: "center" }}>
                    <Txt size={0.82} color={t.danger}>Remove</Txt>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={{ marginTop: t.s5, paddingTop: t.s2, borderTopWidth: t.hairW, borderTopColor: t.hair }}>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Kitchen sink replacement" />
        <Field label="Short description (optional)" value={desc} onChangeText={setDesc} multiline />
        {asset ? <Image source={{ uri: asset.uri }} accessibilityIgnoresInvertColors accessibilityLabel="Photo to add" resizeMode="cover" style={{ marginTop: t.s4, width: "100%", height: ui.photoPreview, borderRadius: t.r2 }} /> : null}
        {addError ? <FormNote>{addError}</FormNote> : null}
        <View style={{ marginTop: t.s4, gap: t.s2 }}>
          <Button disabled={adding} onPress={() => void choose()}>{asset ? "Choose a different photo" : "Choose a photo"}</Button>
          <Button variant="secondary" loading={adding} disabled={!asset} onPress={() => void add()}>Add to portfolio</Button>
        </View>
      </View>
    </Card>
  );
}

function DayChip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} onPress={onPress}
      style={{ minHeight: t.hCtl, minWidth: t.hCtl, paddingHorizontal: t.s3, alignItems: "center", justifyContent: "center", borderRadius: ui.pill, borderWidth: t.hairW,
        borderColor: on ? t.text : t.hair, backgroundColor: on ? rgba(t.fg, 0.1) : rgba(t.fg, 0.04) }}>
      <Txt variant={on ? "bodyMedium" : "body"} size={0.85} color={on ? t.text : rgba(t.muted, 0.95)}>{label}</Txt>
    </Pressable>
  );
}

// ── Availability (web saveAvail: saves on every change, rolled back on failure) ──
function AvailabilityCard({ contractor, userId }: { contractor: any; userId: string }) {
  const { t } = useTheme();
  const [avail, setAvail] = useState(() => readAvailability(contractor?.availability));
  const [custom, setCustom] = useState(false);

  const save = async (next: { days: string[]; start: string; end: string }) => {
    // Reject an invalid window (end at/before start) before writing anything (web).
    if (next.start && next.end && next.end <= next.start) { notify("Your end time needs to be after your start time.", "danger"); return; }
    const prev = avail;
    setAvail(next);
    try { await updateContractor(userId, { availability: next }); }
    catch { setAvail(prev); notify("Couldn't save your availability. Please try again.", "danger"); }
  };

  const eq = (a: string[]) => a.length === avail.days.length && a.every((d) => avail.days.includes(d));
  const active = eq(AVAIL_DAYS) ? "every" : eq(WEEKDAYS) ? "weekdays" : avail.days.length ? "custom" : "none";
  const showChips = custom || active === "custom";
  const times = TIME_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

  return (
    <Card style={{ padding: t.s4, gap: t.s4 }}>
      <Txt size={0.85} color={rgba(t.muted, 0.8)} lh={1.5}>Pick a typical week. You can fine-tune any day. Changes save automatically.</Txt>
      <Segmented<string> label="Typical week" value={active === "none" ? "" : active}
        onChange={(v) => { if (v === "custom") { setCustom((c) => !c || active !== "custom"); } else { setCustom(false); void save({ ...avail, days: v === "every" ? AVAIL_DAYS : WEEKDAYS }); } }}
        options={[{ value: "weekdays", label: "Weekdays" }, { value: "every", label: "Every day" }, { value: "custom", label: "Custom" }]} />
      {showChips ? (
        <View style={{ gap: t.s2 }}>
          <Txt variant="label" size={0.78} color={rgba(t.muted, 0.7)}>TAP THE DAYS YOU USUALLY WORK</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2 }}>
            {AVAIL_DAYS.map((d) => (
              <DayChip key={d} on={avail.days.includes(d)} label={d.slice(0, 3)}
                onPress={() => void save({ ...avail, days: avail.days.includes(d) ? avail.days.filter((x) => x !== d) : [...avail.days, d] })} />
            ))}
          </View>
        </View>
      ) : null}
      {avail.days.length > 0 ? (
        <View style={{ gap: t.s3 }}>
          <Txt variant="label" size={0.78} color={rgba(t.muted, 0.7)}>HOURS YOU&apos;RE USUALLY AVAILABLE</Txt>
          <TimeRow label="From" value={avail.start} options={times} onChange={(v) => void save({ ...avail, start: v })} />
          <TimeRow label="To" value={avail.end} options={times} onChange={(v) => void save({ ...avail, end: v })} />
          {avail.end <= avail.start ? <Txt size={0.82} color={t.warn}>End time should be after the start time.</Txt> : null}
        </View>
      ) : !showChips ? (
        <Txt size={0.82} color={t.warn}>No availability set yet. Pick a preset or Custom so clients know when to reach you.</Txt>
      ) : null}
    </Card>
  );
}

/** A native stand-in for web's <select>: a stepper over the same half-hour options. */
function TimeRow({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const { t } = useTheme();
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  const step = (d: number) => { const n = options[i + d]; if (n) onChange(n.value); };
  const btn = (txt: string, d: number, name: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={name} disabled={!options[i + d]} onPress={() => step(d)}
      style={{ width: t.hCtl, height: t.hCtl, borderRadius: t.r3, alignItems: "center", justifyContent: "center", borderWidth: t.hairW, borderColor: t.hair, backgroundColor: rgba(t.fg, 0.04), opacity: options[i + d] ? 1 : 0.4 }}>
      <Txt variant="bodyMedium" size={1.1}>{txt}</Txt>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: t.s3 }}>
      <Txt size={0.85} color={rgba(t.muted, 0.8)} style={{ width: t.hCtl }}>{label}</Txt>
      {btn("−", -1, `Earlier ${label.toLowerCase()} time`)}
      <Txt variant="bodyMedium" style={{ minWidth: t.hCtl * 1.5, textAlign: "center" }}>{options[i]?.label ?? value}</Txt>
      {btn("+", 1, `Later ${label.toLowerCase()} time`)}
    </View>
  );
}

export function AccountScreen() {
  const { t, scheme, scale } = useTheme();
  const { state, reload } = useContractorData();
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

  const d = state.data;
  const nav = contractorNav(navCounts(d));
  const mail = () => {
    const subject = encodeURIComponent("Bug report: Freddy Fix It");
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(() => notify(`Couldn't open your email app. Write to ${SUPPORT_EMAIL}.`, "danger"));
  };
  const payoutsOn = !!d.contractor?.stripe_payouts_enabled;

  return (
    <Screen onRefresh={reload}>
      <ScreenHeader title="Account" back={false} />
      <ProfileCard profile={d.profile} contractor={d.contractor} email={d.email ?? ""} userId={d.userId} reload={reload} />

      <Group label="YOUR PROFILE">
        <FactsCard contractor={d.contractor} userId={d.userId} />
        <Card style={{ marginTop: t.s3 }}>
          <Row icon="user-check" tone="neutral" title="Photo, service area, trade, licence, insurance and documents"
            sub="Add or change these on freddyfixit.ca. Opens your profile there." chevron onPress={() => openOnWeb(PROFILE_ON_WEB)} />
        </Card>
      </Group>

      <Group label="YOUR PRICING & TAX DETAILS"><PricingCard contractor={d.contractor} userId={d.userId} reload={reload} /></Group>
      <Group label="PORTFOLIO & REVIEWS">
        <PortfolioCard contractor={d.contractor} portfolio={d.portfolio} portfolioFailed={d.portfolioFailed} userId={d.userId} reload={reload} />
      </Group>
      <Group label="AVAILABILITY"><AvailabilityCard contractor={d.contractor} userId={d.userId} /></Group>

      <Group label="PAYOUTS">
        <Card>
          {payoutsOn ? (
            <Row icon="check-circle" tone="good" title="Connected" sub="You're set up to receive payouts." />
          ) : (
            // Step 5.3 (Stripe Connect in the app) needs web change E2 first. Until then the website does it.
            <Row icon="dollar" tone="neutral" title={d.contractor?.stripe_account_id ? "Finish payout setup on the website" : "Set up payouts on the website"}
              sub="Opens freddyfixit.ca. Payout setup comes to the app in an upcoming update." chevron onPress={() => openOnWeb(PROFILE_ON_WEB)} />
          )}
        </Card>
      </Group>

      <Group label="MORE">
        <Card>
          {nav.reviews ? <Row icon="star" tone="neutral" title="Reviews" sub={String(d.reviews.length)} chevron onPress={() => router.push("/contractor/reviews")} /> : null}
          <Row icon="file" tone="neutral" title="Contractor guide" sub="How Freddy Fix It works for pros" chevron onPress={() => router.push("/contractor/guide")} />
        </Card>
      </Group>

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
          <Row icon="trash" tone="neutral" title="Delete account on the website" sub="Deleting your account is done on freddyfixit.ca for now. Opens your profile there." chevron
            onPress={() => openOnWeb(PROFILE_ON_WEB)} />
        </Card>
        <View style={{ marginTop: t.s4 }}>
          <Button variant="ghost" full onPress={() => void signOut()}>Sign out</Button>
        </View>
      </Group>
    </Screen>
  );
}
