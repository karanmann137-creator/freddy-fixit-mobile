// The pieces of a job request, shared by the signed-in form (NewRequestScreen,
// PLAN 4.3) and the signup funnel (GetStartedScreen, PLAN 4.4). One copy, so the
// two forms can't drift (web: its two photo boxes had already drifted on wording
// before PhotoPicker.tsx was shared). Each is a port of the web block named beside it;
// the words are web's.
//
// No business rules here: every rule is a synced src/lib import or webPage.ts.
import React, { useState } from "react";
import { Image, Pressable, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { BottomSheet, Button, ButtonRow, Field, Ic, Txt, rgba, ui, useTheme, type IconName } from "@/kit";
import { AREAS, areaToken } from "@/lib/calgaryAreas";
import { benchmarkFor, fromText, money, type ServicePrice } from "@/lib/servicePricing";
import { SLIDER_SHORT, SLIDER_STOPS, freqLabel, isPerKmService } from "@/lib/recurrence";
import type { SplitPart } from "@/lib/jobSplit";
import type { UploadAsset } from "@/lib/imageCompress";
import { openOnWeb } from "@/features/client/web";
import { PHOTO_MAX_BYTES, PHOTO_TOO_BIG, SCHEDULES, SEASON_PRESETS, SERVICES } from "./webPage";
import type { RequestCore } from "./useRequestCore";

/** A calendar date as the DB `date` columns take it. A shape check on what was typed, not a rule. */
const ON_ORANGE = "#fff"; // rule-ok: white on orange, the same pair as the kit primary Button

export const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v + "T00:00:00").getTime());

// ---------------------------------------------------------------- small parts
export function Label({ children, aside, first }: { children: string; aside?: string; first?: boolean }) {
  const { t } = useTheme();
  return (
    <Txt variant="label" size={0.8} color={rgba(t.muted, 0.75)} style={{ marginTop: first ? 0 : t.s5, marginBottom: t.s2 }} accessibilityRole="header">
      {children.toUpperCase()}
      {aside ? <Txt size={0.75} color={rgba(t.muted, 0.5)}>{"  " + aside}</Txt> : null}
    </Txt>
  );
}

export function Note({ children, tight }: { children: React.ReactNode; tight?: boolean }) {
  const { t } = useTheme();
  return <Txt size={0.78} lh={1.5} color={rgba(t.muted, 0.6)} style={{ marginTop: tight ? t.s1 : t.s2 }}>{children}</Txt>;
}

export function ErrorText({ children }: { children?: string }) {
  const { t } = useTheme();
  if (!children) return null;
  return <Txt size={0.8} color={t.danger} style={{ marginTop: t.s2 }} accessibilityLiveRegion="polite">{children}</Txt>;
}

/** A text-only action (web: the underlined button). 48dp tall, never orange. */
export function LinkButton({ children, onPress }: { children: string; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={children} hitSlop={t.s2}
      style={{ minHeight: t.hCtl, justifyContent: "center", alignSelf: "flex-start" }}>
      <Txt size={0.85} color={rgba(t.muted, 0.85)} style={{ textDecorationLine: "underline" }}>{children}</Txt>
    </Pressable>
  );
}

/** A tappable answer chip. Selected = tinted, never a solid orange fill. */
export function Chip({ label, on, onPress, removable, a11y }: { label: string; on?: boolean; onPress: () => void; removable?: boolean; a11y?: string }) {
  const { t } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole={removable ? "button" : "checkbox"} accessibilityState={removable ? undefined : { checked: !!on }}
      accessibilityLabel={a11y ?? (removable ? `Remove ${label}` : label)}
      style={{ minHeight: t.hCtl, flexDirection: "row", alignItems: "center", gap: t.s2, paddingHorizontal: t.s4, borderRadius: ui.pill,
        borderWidth: ui.line, borderColor: on ? t.accent500 : rgba(t.fg, 0.12), backgroundColor: on ? t.accentSoft : rgba(t.fg, 0.04) }}>
      <Txt size={0.88} color={on ? t.text : rgba(t.muted, 0.85)}>{label}</Txt>
      {removable ? <Ic name="x-circle" size={ui.icon.sm} color={on ? t.accent500 : rgba(t.muted, 0.6)} /> : null}
    </Pressable>
  );
}

export function Chips({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2 }}>{children}</View>;
}

/** One choice of several, as a full-width row (web schedBtn/addrBtn). */
export function ChoiceRow({ title, sub, icon, on, onPress }: { title: string; sub?: string; icon?: IconName; on: boolean; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={sub ? `${title}, ${sub}` : title}
      style={{ minHeight: t.hCtl, flexDirection: "row", alignItems: "center", gap: t.s3, paddingVertical: t.s3, paddingHorizontal: t.s4, marginBottom: t.s2,
        borderRadius: t.r2, borderWidth: t.hairW, borderColor: on ? rgba(t.accentRgb, 0.5) : rgba(t.fg, 0.08), backgroundColor: on ? rgba(t.accentRgb, 0.12) : rgba(t.fg, 0.04) }}>
      <Ic name={icon ?? (on ? "radio-on" : "radio-off")} size={icon ? ui.icon.xl : ui.icon.lg} color={t.accent500} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyMedium" size={0.95} color={on ? t.text : rgba(t.muted, 0.9)}>{title}</Txt>
        {sub ? <Txt size={0.78} color={rgba(t.muted, 0.55)}>{sub}</Txt> : null}
      </View>
    </Pressable>
  );
}

/** A checkbox row (web: the terms/newsletter/vehicle ticks). */
export function Tick({ checked, onChange, children, label }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; label: string }) {
  const { t } = useTheme();
  return (
    <Pressable onPress={() => onChange(!checked)} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label}
      style={{ minHeight: t.hCtl, flexDirection: "row", alignItems: "flex-start", gap: t.s3, padding: t.s3, marginTop: t.s3,
        borderRadius: t.r2, borderWidth: t.hairW, borderColor: rgba(t.fg, 0.08), backgroundColor: rgba(t.fg, 0.03) }}>
      <View style={{ width: ui.tick, height: ui.tick, borderRadius: t.r1 / 2, borderWidth: ui.edge, alignItems: "center", justifyContent: "center", marginTop: ui.nudge,
        borderColor: checked ? t.accent500 : rgba(t.muted, 0.5), backgroundColor: checked ? t.accentSoft : "transparent" }}>
        {checked ? <Ic name="check" size={ui.icon.sm} color={t.accent500} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </Pressable>
  );
}

/** "I agree to the User Agreement and Privacy Policy" (web: both forms; signup adds "I am 18 or older"). */
export function TermsTick({ checked, onChange, adult }: { checked: boolean; onChange: (v: boolean) => void; adult?: boolean }) {
  const { t } = useTheme();
  const link = (label: string, path: string) => (
    <Txt size={0.82} color={t.accent500} onPress={() => openOnWeb(path)} accessibilityRole="link">{label}</Txt>
  );
  return (
    <Tick checked={checked} onChange={onChange} label={`${adult ? "I am 18 or older and I" : "I"} agree to Freddy Fix It's User Agreement and Privacy Policy`}>
      <Txt size={0.82} lh={1.6} color={rgba(t.muted, 0.75)}>
        {adult ? "I am 18 or older and I agree to Freddy Fix It’s " : "I agree to Freddy Fix It’s "}
        {link("User Agreement", "/user-agreement")}{" and "}{link("Privacy Policy", "/privacy-policy")}.
      </Txt>
    </Tick>
  );
}

/** web OnboardingProgress: numbered circles, filled up to the current step. */
export function StepProgress({ step, total }: { step: number; total: number }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: t.s5 }} accessible accessibilityRole="progressbar" accessibilityLabel={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const filled = n <= step;
        return (
          <View key={n} style={{ flexDirection: "row", alignItems: "center", flex: n < total ? 1 : 0 }}>
            <View style={{ width: ui.progressDot, height: ui.progressDot, borderRadius: ui.pill, alignItems: "center", justifyContent: "center",
              backgroundColor: filled ? t.accent500 : rgba(t.fg, 0.08), borderWidth: n === step ? ui.edge : 0, borderColor: rgba(t.accentRgb, 0.35) }}>
              <Txt variant="label" size={0.92} color={filled ? ON_ORANGE : rgba(t.muted, 0.55)}>{String(n)}</Txt>
            </View>
            {n < total ? <View style={{ flex: 1, height: ui.progressBar, marginHorizontal: t.s1, borderRadius: ui.pill, backgroundColor: n < step ? rgba(t.accentRgb, 0.45) : rgba(t.fg, 0.1) }} /> : null}
          </View>
        );
      })}
    </View>
  );
}

/** "We saved your progress." The form already filled itself in; it says so (web). */
export function DraftBanner({ onStartOver }: { onStartOver: () => void }) {
  const { t } = useTheme();
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: t.s3, paddingHorizontal: t.s4, marginBottom: t.s4,
      borderRadius: t.r2, backgroundColor: rgba(t.successRgb, 0.1), borderWidth: ui.line, borderColor: rgba(t.successRgb, 0.3) }}>
      <Ic name="check" size={ui.icon.md} color={t.success} />
      <Txt size={0.88} style={{ flex: 1 }}>We saved your progress.</Txt>
      <LinkButton onPress={onStartOver}>Start over</LinkButton>
    </View>
  );
}

/** The step's heading (web: the big Bebas STEP_TITLES line). */
export function StepTitle({ children }: { children: string }) {
  const { t } = useTheme();
  return <Txt variant="label" size={2.2} ls={0.06} accessibilityRole="header" style={{ marginBottom: t.s5 }}>{children}</Txt>;
}

/** The form's own card (web s.card). */
export function FormCard({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={{ backgroundColor: rgba(t.fg, 0.04), borderWidth: t.hairW, borderColor: rgba(t.fg, 0.08), borderRadius: t.r3, padding: t.s5 }}>
      {children}
    </View>
  );
}

/** Back + Next/Submit. The forward button is the screen's one orange button. */
export function FormNav({ backLabel, onBack, nextLabel, onNext, busy }: { backLabel: string; onBack: () => void; nextLabel: string; onNext: () => void; busy?: boolean }) {
  return (
    <ButtonRow>
      <Button full onPress={onBack} disabled={busy}>{backLabel}</Button>
      <Button full variant="primary" loading={busy} onPress={onNext}>{nextLabel}</Button>
    </ButtonRow>
  );
}

// ---------------------------------------------------------------- photo (web PhotoPicker + the nudge)
export function PhotoPicker({ asset, onPick, onRemove, onError, hint }: {
  asset: UploadAsset | null; onPick: (a: UploadAsset) => void; onRemove: () => void; onError: (msg: string) => void; hint?: string;
}) {
  const { t } = useTheme();
  const pick = async (camera: boolean) => {
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { onError("Camera access is off for Freddy Fix It. Turn it on in Settings, or choose a photo you already have."); return; }
      }
      const r = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
      if (r.canceled) return;
      const a = r.assets?.[0];
      if (!a) return; // a cancelled picker returns nothing (web rule)
      if (typeof a.fileSize === "number" && a.fileSize > PHOTO_MAX_BYTES) { onError(PHOTO_TOO_BIG); return; }
      onPick({ uri: a.uri, mimeType: a.mimeType ?? null, fileName: a.fileName ?? null, width: a.width, height: a.height });
    } catch {
      onError("Couldn't open your photos. Try again.");
    }
  };
  return (
    <View>
      <Pressable onPress={() => void pick(false)} accessibilityRole="button" accessibilityLabel={asset ? "Choose a different photo" : "Add a photo"}
        style={{ alignItems: "center", justifyContent: "center", gap: t.s3, paddingVertical: t.s6, paddingHorizontal: t.s5, borderRadius: t.r3,
          borderWidth: ui.edge, borderStyle: "dashed", borderColor: asset ? rgba(t.accentRgb, 0.55) : rgba(t.fg, 0.16),
          backgroundColor: asset ? rgba(t.accentRgb, 0.06) : rgba(t.fg, 0.02) }}>
        {asset ? (
          <Image source={{ uri: asset.uri }} accessibilityIgnoresInvertColors resizeMode="cover"
            style={{ width: "100%", height: ui.photoPreview, borderRadius: t.r2 }} />
        ) : (
          <View style={{ width: ui.photoTile, height: ui.photoTile, borderRadius: ui.pill, alignItems: "center", justifyContent: "center",
            backgroundColor: rgba(t.accentRgb, 0.12), borderWidth: ui.line, borderColor: rgba(t.accentRgb, 0.35) }}>
            <Ic name="camera" size={ui.icon.xl * 1.8} color={t.accent500} />
          </View>
        )}
        <View style={{ alignItems: "center" }}>
          <Txt variant="bodyMedium" size={0.95} color={asset ? t.accent500 : t.text}>{asset ? "Photo added" : "Tap to add a photo"}</Txt>
          <Txt size={0.78} color={rgba(t.muted, 0.55)} style={{ marginTop: t.s1, textAlign: "center" }}>
            {asset ? "Tap to choose a different one" : (hint || "Take one now, or pick one you've already got")}
          </Txt>
        </View>
      </Pressable>
      <View style={{ flexDirection: "row", gap: t.s5 }}>
        <LinkButton onPress={() => void pick(true)}>Take a photo</LinkButton>
        {asset ? <LinkButton onPress={onRemove}>Remove photo</LinkButton> : null}
      </View>
    </View>
  );
}

/** web: the advisory shown after the one nudge. A nudge, never a gate. */
export function PhotoNudge() {
  const { t } = useTheme();
  return (
    <View style={{ marginTop: t.s3, padding: t.s4, borderRadius: t.r2, backgroundColor: rgba(t.accentRgb, 0.08), borderWidth: ui.line, borderColor: rgba(t.accentRgb, 0.28) }}>
      <Txt size={0.82} lh={1.6} color={rgba(t.muted, 0.85)}>
        <Txt variant="bodyBold" size={0.82} color={t.text}>A photo gets you a real number, faster.</Txt>
        {" "}Pros price what they can see. With a photo you’ll usually get firm estimates the same day; without one you’re more likely to get a wide ballpark, questions before anyone will quote, or a pro who wants to come out and look first.
      </Txt>
      <Txt size={0.82} lh={1.6} color={rgba(t.muted, 0.7)} style={{ marginTop: t.s2 }}>
        It’s still optional — press Next again to carry on without one, and you can add a photo from your dashboard any time after you post.
      </Txt>
    </View>
  );
}

// ---------------------------------------------------------------- services (web ServicePicker + the confirm screen)
export function ServicePicker({ selected, onToggle, pricing }: { selected: string[]; onToggle: (label: string) => void; pricing: Record<string, ServicePrice> }) {
  const { t } = useTheme();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = query ? SERVICES.filter(i => i.label.toLowerCase().includes(query)) : SERVICES;
  const customSelected = selected.filter(l => !SERVICES.some(i => i.label === l));
  const exactExists = SERVICES.some(i => i.label.toLowerCase() === query) || selected.some(l => l.toLowerCase() === query);
  const canAddCustom = query.length >= 2 && !exactExists;
  const addCustom = () => {
    const label = q.trim();
    if (label.length < 2) return;
    if (!selected.some(l => l.toLowerCase() === label.toLowerCase())) onToggle(label);
    setQ("");
  };
  const tiles = [
    ...customSelected.map(l => ({ iconName: "package" as IconName, label: l, hint: undefined as string | undefined })),
    ...filtered.map(i => ({ ...i, hint: fromText(pricing[i.label]) || undefined })),
  ];
  const rows: (typeof tiles)[] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));
  return (
    <View>
      <Field label="Search services" value={q} onChangeText={setQ} placeholder="Search a service (e.g. plumbing, moving, junk removal)…"
        autoCorrect={false} returnKeyType="done" onSubmitEditing={() => { if (canAddCustom) addCustom(); }} />
      {canAddCustom ? (
        <Pressable onPress={addCustom} accessibilityRole="button" style={{ minHeight: t.hCtl, justifyContent: "center", marginTop: t.s3, paddingHorizontal: t.s4,
          borderRadius: t.r1, borderWidth: ui.line, borderStyle: "dashed", borderColor: t.accentLine, backgroundColor: t.accentSoft }}>
          <Txt size={0.85}>{`+ Use “${q.trim()}” as your service`}</Txt>
        </Pressable>
      ) : null}
      <View style={{ gap: t.s3, marginTop: t.s3 }}>
        {rows.map((pair) => (
          <View key={pair.map(p => p.label).join("|")} style={{ flexDirection: "row", gap: t.s3 }}>
            {pair.map(tile => {
              const on = selected.includes(tile.label);
              return (
                <Pressable key={tile.label} onPress={() => onToggle(tile.label)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                  accessibilityLabel={tile.hint ? `${tile.label}, ${tile.hint}` : tile.label}
                  style={{ flex: 1, minWidth: 0, minHeight: t.hCtl, flexDirection: "row", alignItems: "center", gap: t.s2, padding: t.s3, borderRadius: t.r2,
                    borderWidth: t.hairW, borderColor: on ? rgba(t.accentRgb, 0.5) : rgba(t.fg, 0.08), backgroundColor: on ? rgba(t.accentRgb, 0.12) : rgba(t.fg, 0.04) }}>
                  <Ic name={tile.iconName} size={ui.icon.xl} color={t.accent500} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={0.85} color={on ? t.text : rgba(t.muted, 0.85)} numberOfLines={2}>{tile.label}</Txt>
                    {tile.hint ? <Txt size={0.68} color={rgba(t.muted, 0.55)}>{tile.hint}</Txt> : null}
                  </View>
                  {on ? <Ic name="check" size={ui.icon.md} color={t.accent500} /> : null}
                </Pressable>
              );
            })}
            {pair.length === 1 ? <View style={{ flex: 1 }} /> : null}
          </View>
        ))}
      </View>
      {filtered.length === 0 && !canAddCustom ? <Note>No match. Type at least 2 letters to add your own service.</Note> : null}
    </View>
  );
}

/** "Did we get that right?": the services and details read out of the description. */
export function ServiceConfirm({ core, error, tagNote }: { core: RequestCore; error?: string; tagNote: string }) {
  const { t } = useTheme();
  const sel = core.selectedServices;
  return (
    <View>
      <Label first>The service we picked</Label>
      {sel.length > 0 ? (
        <>
          <Chips>{sel.map(sv => <Chip key={sv} label={sv} on removable onPress={() => core.toggleService(sv)} />)}</Chips>
          <Note>Tap one to remove it. Wrong trade? Add the right one below.</Note>
        </>
      ) : (
        <Txt size={0.88} lh={1.5} color={rgba(t.muted, 0.7)}>We couldn’t tell which trade this needs — pick one below and we’ll take it from there.</Txt>
      )}
      <ErrorText>{error}</ErrorText>
      {core.tags.length > 0 ? (
        <>
          <Label>Details we spotted</Label>
          <Chips>{core.tags.map(tg => <Chip key={tg} label={tg} removable onPress={() => core.removeTag(tg)} />)}</Chips>
          <Note>{tagNote}</Note>
        </>
      ) : null}
      {core.showAllServices || sel.length === 0 ? (
        <>
          <Label aside="(select all that apply)">All services</Label>
          <ServicePicker selected={sel} onToggle={core.toggleService} pricing={core.pricing} />
        </>
      ) : (
        <Pressable onPress={() => core.setShowAllServices(true)} accessibilityRole="button"
          style={{ minHeight: t.hCtl, alignItems: "center", justifyContent: "center", marginTop: t.s5, borderRadius: t.r2,
            borderWidth: ui.line, borderStyle: "dashed", borderColor: rgba(t.fg, 0.2), backgroundColor: rgba(t.fg, 0.04) }}>
          <Txt size={0.88} color={rgba(t.muted, 0.8)}>+ Add or change the service</Txt>
        </Pressable>
      )}
    </View>
  );
}

/** Tap-only follow-ups for the first service. Every one is optional (web). */
export function QuestionsBlock({ core }: { core: RequestCore }) {
  const { t } = useTheme();
  const qs = core.activeQuestions;
  if (!qs.length) return null;
  return (
    <View>
      <Txt size={0.82} color={rgba(t.muted, 0.6)} style={{ marginBottom: t.s4 }}>{`${core.answeredCount} of ${qs.length} answered · every one is optional`}</Txt>
      {qs.map(q => (
        <View key={q.id} style={{ marginBottom: t.s5 }}>
          <Txt variant="bodyMedium" size={0.95} lh={1.45} style={{ marginBottom: t.s3 }}>
            {q.prompt}
            {q.multi ? <Txt size={0.82} color={rgba(t.muted, 0.55)}> · pick any that apply</Txt> : null}
          </Txt>
          <Chips>{q.options.map(opt => <Chip key={opt} label={opt} on={core.isAnswered(q, opt)} onPress={() => core.setAnswer(q, opt)} />)}</Chips>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- when (web: schedule + the recurring box)
export function ScheduleBlock({ core, error, onPicked, label = "When do you need it?" }: { core: RequestCore; error?: string; onPicked: () => void; label?: string }) {
  return (
    <View>
      <Label>{label}</Label>
      {SCHEDULES.map(sc => (
        <ChoiceRow key={sc.label} icon={sc.iconName} title={sc.label} sub={sc.sub} on={core.schedule === sc.label}
          onPress={() => { core.setSchedule(sc.label); onPicked(); }} />
      ))}
      <ErrorText>{error}</ErrorText>
      {core.schedule === "Recurring" ? <RecurringBox core={core} /> : null}
    </View>
  );
}

function RecurringBox({ core }: { core: RequestCore }) {
  const { t } = useTheme();
  const [newDate, setNewDate] = useState("");
  const [dateErr, setDateErr] = useState("");
  const freq = core.recurringFrequency;
  const special = freq === "seasonal" || freq === "per_km";
  const addDate = () => {
    const d = newDate.trim();
    if (!isIsoDate(d)) { setDateErr("Type the date as YYYY-MM-DD, e.g. 2026-12-15."); return; }
    if (d < new Date().toISOString().slice(0, 10)) { setDateErr("Pick a date from today on."); return; } // web: <input type=date min={today}>
    core.addDate(d); setNewDate(""); setDateErr("");
  };
  return (
    <View style={{ marginTop: t.s2, padding: t.s4, gap: t.s2, borderRadius: t.r2, backgroundColor: rgba(t.accentRgb, 0.06), borderWidth: ui.line, borderColor: rgba(t.accentRgb, 0.2) }}>
      <Label first>How often?</Label>
      {!special ? (
        <View>
          <Chips>
            {SLIDER_STOPS.map((stop, i) => (
              <Chip key={stop} label={SLIDER_SHORT[stop]} on={i === core.sliderIdx} a11y={freqLabel(stop)} onPress={() => core.pickSlider(i)} />
            ))}
          </Chips>
          <Txt variant="bodyMedium" size={0.85} style={{ marginTop: t.s2 }}>{freqLabel(SLIDER_STOPS[core.sliderIdx])}</Txt>
        </View>
      ) : null}
      <Chips>
        <Chip label="Seasonal" on={freq === "seasonal"} onPress={() => core.setRecurringFrequency("seasonal")} />
        {core.selectedServices.some(isPerKmService) ? <Chip label="Per distance (km)" on={freq === "per_km"} onPress={() => core.setRecurringFrequency("per_km")} /> : null}
        {special ? <Chip label="Use slider instead" onPress={() => core.pickSlider(core.sliderIdx)} /> : null}
      </Chips>
      {freq === "per_km" ? (
        <View>
          <Field label="Service every… (km)" value={core.recurringKm} onChangeText={(v) => core.setRecurringKm(v.replace(/\D/g, ""))} keyboardType="number-pad" placeholder="e.g. 5000" />
          <Note>We can’t read your odometer, so we’ll send an estimated reminder based on typical driving.</Note>
        </View>
      ) : null}
      <Label aside="(optional)">Pay ahead?</Label>
      <Chips>
        {[0, 2, 3].map(n => <Chip key={n} label={n === 0 ? "Pay each visit" : `Prepay ${n} visits`} on={core.prepayPref === n} onPress={() => core.setPrepayPref(n)} />)}
      </Chips>
      <Note>Prepaid visits are held securely and released one visit at a time. Set this up after your first estimate is approved — unused visits are refundable.</Note>
      {freq === "seasonal" ? (
        <>
          <Label>Quick season presets</Label>
          <Chips>{SEASON_PRESETS.map(sp => <Chip key={sp.label} label={sp.label} onPress={() => core.applySeason(sp)} />)}</Chips>
        </>
      ) : null}
      <View style={{ flexDirection: "row", gap: t.s3 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Field label="Start date (optional)" value={core.recurringStartDate} onChangeText={core.setRecurringStartDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" autoCorrect={false} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Field label="End date (optional)" value={core.recurringEndDate} onChangeText={core.setRecurringEndDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" autoCorrect={false} />
        </View>
      </View>
      <Label aside="(optional)">Add specific visit dates</Label>
      <Note tight>Pick exact dates you also want a visit — each becomes a scheduled booking on top of your regular cadence.</Note>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: t.s3 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Field label="Visit date" value={newDate} onChangeText={(v) => { setNewDate(v); setDateErr(""); }} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" autoCorrect={false} error={dateErr || null} />
        </View>
        <View style={{ paddingBottom: dateErr ? t.s6 : 0 }}><Button disabled={!newDate.trim()} onPress={addDate}>+ Add date</Button></View>
      </View>
      {core.recurringDates.length > 0 ? (
        <Chips>
          {core.recurringDates.map(d => (
            <Chip key={d} on removable a11y={`Remove ${d}`} onPress={() => core.removeDate(d)}
              label={new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} />
          ))}
        </Chips>
      ) : null}
    </View>
  );
}

/** Start/end dates must be real dates before they reach a `date` column. Empty is fine (optional). */
export function recurringDateError(core: RequestCore): string {
  if (core.schedule !== "Recurring") return "";
  for (const v of [core.recurringStartDate, core.recurringEndDate]) {
    if (v.trim() && !isIsoDate(v.trim())) return "Type start and end dates as YYYY-MM-DD, or leave them empty.";
  }
  return "";
}

// ---------------------------------------------------------------- where (web: approximate location)
export function LocationBlock({ core, error, label, onEdit, last }: {
  core: RequestCore; error?: string; label: string; onEdit: () => void;
  /** Signed-in form only: "Same as last time", offered only when both halves parsed. */
  last?: { text: string; choice: string; setChoice: (c: "last" | "new") => void };
}) {
  const { t } = useTheme();
  const enteringNew = !last || last.choice === "new" || !last.text;
  return (
    <View>
      <Label aside="(postal code — we'll ask for the address once you've picked a pro)">{label}</Label>
      {last?.text ? (
        <>
          <ChoiceRow title={`Same as last time — ${last.text}`} on={last.choice === "last"} onPress={() => { last.setChoice("last"); onEdit(); }} />
          <ChoiceRow title="Somewhere else" on={last.choice === "new"} onPress={() => { last.setChoice("new"); onEdit(); }} />
        </>
      ) : null}
      {enteringNew ? (
        <>
          <Field label="Postal code" value={core.postalCode} placeholder="e.g. T2P 1J9" autoCapitalize="characters" autoCorrect={false}
            autoComplete="postal-code" textContentType="postalCode" maxLength={7} error={error || null}
            onChangeText={(v) => { core.onPostal(v.toUpperCase()); onEdit(); }} />
          {!core.showAreaChips && core.derivedArea ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: t.s3, flexWrap: "wrap", marginTop: t.s2 }}>
              {/* The TOKEN that gets stored, so what the client reads is what the pro reads (web). */}
              <Chip label={areaToken(core.derivedArea) || core.derivedArea} on onPress={() => core.setAreaOverride(true)} a11y={`Area: ${areaToken(core.derivedArea) || core.derivedArea}. Tap to change`} />
              <LinkButton onPress={() => core.setAreaOverride(true)}>Not right? Pick the area</LinkButton>
            </View>
          ) : null}
          {core.showAreaChips ? (
            <>
              <Label>Which part of town?</Label>
              {!core.derivedArea ? <Note tight>We don’t recognise that postal code, so pick the closest area — it’s what decides which pros see your job.</Note> : null}
              <View style={{ marginTop: t.s2 }}>
                <Chips>{AREAS.map(a => <Chip key={a} label={a} on={core.area === a} onPress={() => { core.setArea(core.area === a ? "" : a); onEdit(); }} />)}</Chips>
              </View>
            </>
          ) : null}
        </>
      ) : null}
      <Note>Pros bidding on your job see the area and postal code only. Your full address goes to the one pro you choose, and not before.</Note>
      {!enteringNew ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

// ---------------------------------------------------------------- what it costs (web BudgetPicker: read-only)
export function BudgetNote({ services, pricing }: { services: string[]; pricing: Record<string, ServicePrice> }) {
  const { t } = useTheme();
  const bm = benchmarkFor(services.join(", "), pricing);
  const changeNote = (
    <View style={{ flexDirection: "row", gap: t.s3, padding: t.s4, borderRadius: t.r2, backgroundColor: rgba(t.muted, 0.06), borderWidth: ui.line, borderColor: rgba(t.muted, 0.16) }}>
      <Ic name="info" size={ui.icon.sm} color={rgba(t.muted, 0.55)} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={0.82} lh={1.6} color={rgba(t.muted, 0.75)}>
          <Txt variant="bodyBold" size={0.82} color={t.text}>A price can change once a pro sees the work.</Txt>
          {" "}Scope and materials are the usual reasons. Any change needs your approval first, and you will see what changed and why — a deposit you have already paid is never recalculated.
        </Txt>
        <Txt size={0.82} lh={1.6} color={rgba(t.muted, 0.75)} style={{ marginTop: t.s2 }}>Talk the details through with your pro before you confirm anything.</Txt>
      </View>
    </View>
  );
  if (!bm) return <View style={{ marginTop: t.s6 }}>{changeNote}</View>;
  return (
    <View style={{ marginTop: t.s6 }}>
      <Label first>What this usually costs</Label>
      <View style={{ flexDirection: "row", gap: t.s2, padding: t.s3, borderRadius: t.r2, backgroundColor: rgba(t.accentRgb, 0.08), borderWidth: ui.line, borderColor: rgba(t.accentRgb, 0.22) }}>
        <Ic name="dollar" size={ui.icon.sm} color={t.accent500} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={0.85} lh={1.5}>
            {services.length > 1 ? "Jobs like these come in around " : "Jobs like this come in around "}
            <Txt variant="bodyBold" size={0.85}>{money(Math.round(bm.benchmark))}</Txt>
          </Txt>
          <Txt size={0.74} color={rgba(t.muted, 0.5)} style={{ marginTop: ui.nudge2 }}>
            {bm.source === "jobs" ? "Based on jobs completed on Freddy Fix It." : "Based on our Calgary price guide — updates as jobs complete."}
          </Txt>
        </View>
      </View>
      <Note>This is a guide, not a quote. Local pros will send you real estimates for your job, and you choose which one to accept.</Note>
      <View style={{ marginTop: t.s4 }}>{changeNote}</View>
    </View>
  );
}

// ---------------------------------------------------------------- multi-trade split (web SplitJobDialog)
/**
 * State, not a promise (web): the answer is a list of edited parts. Both answers
 * re-enter submit with an explicit verdict, so the detector can't run twice.
 * The sheet keys its body on the parts, so a new suggestion starts from its own text.
 */
export function SplitSheet({ parts, onKeepOne, onSplit }: { parts: SplitPart[] | null; onKeepOne: () => void; onSplit: (p: SplitPart[]) => void }) {
  const open = !!parts && parts.length >= 2;
  const key = (parts ?? []).map(p => p.description).join(" ");
  return (
    <BottomSheet open={open} onClose={onKeepOne} label="This looks like separate jobs">
      {open ? <SplitBody key={key} parts={parts!} onKeepOne={onKeepOne} onSplit={onSplit} /> : null}
    </BottomSheet>
  );
}

function SplitBody({ parts, onKeepOne, onSplit }: { parts: SplitPart[]; onKeepOne: () => void; onSplit: (p: SplitPart[]) => void }) {
  const { t } = useTheme();
  const [texts, setTexts] = useState(() => parts.map(p => p.description));
  const tooShort = texts.some(x => x.trim().length < 10);
  return (
    <View>
      <Txt variant="label" size={1.4} ls={0.04} accessibilityRole="header">{`This looks like ${parts.length} separate jobs`}</Txt>
      <Txt size={0.92} lh={1.6} color={rgba(t.muted, 0.85)} style={{ marginTop: t.s2, marginBottom: t.s4 }}>
        Different trades do each part, so posting them separately gets you a pro who actually does the work — and its own price for each. You’ll get an estimate per job.
      </Txt>
      {parts.map((p, i) => (
        <View key={i} style={{ marginBottom: t.s4, padding: t.s4, borderRadius: t.r2, backgroundColor: rgba(t.fg, 0.04), borderWidth: t.hairW, borderColor: rgba(t.fg, 0.08) }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.s3, flexWrap: "wrap" }}>
            <Txt variant="label" size={1} color={rgba(t.muted, 0.7)}>{`Job ${i + 1}`}</Txt>
            <Txt size={0.74}>{p.service}</Txt>
          </View>
          <Field label={`Job ${i + 1} description`} multiline value={texts[i] ?? ""}
            onChangeText={(v) => setTexts(prev => prev.map((x, j) => (j === i ? v : x)))} />
        </View>
      ))}
      {tooShort ? <Txt size={0.8} color={t.warn}>Each job needs a few words of its own so a pro can price it.</Txt> : null}
      <ButtonRow>
        <Button full onPress={onKeepOne}>Keep as one job</Button>
        <Button full variant="primary" disabled={tooShort} onPress={() => onSplit(parts.map((p, i) => ({ ...p, description: (texts[i] ?? "").trim() })))}>
          {`Post ${parts.length} jobs`}
        </Button>
      </ButtonRow>
    </View>
  );
}

// ---------------------------------------------------------------- what happens next (web NextSteps)
function Strong({ children }: { children: string }) {
  const { t } = useTheme();
  return <Txt variant="bodyBold" size={0.88} color={t.text}>{children}</Txt>;
}

/**
 * ONE renderer for both terminal screens (web). THE SPAM LINE IS LOAD-BEARING:
 * signup confirmation travels by a different transport, and in Aug 2026 it stopped
 * arriving and three accounts were locked out. So this names the second email,
 * says plainly they can't sign in until they click it, and says to look in spam.
 */
export function NextSteps({ email, signedIn }: { email: string; signedIn: boolean }) {
  const { t } = useTheme();
  const steps: { t: string; b: React.ReactNode }[] = signedIn
    ? [
        { t: "Open your dashboard", b: "Estimates land there as pros send them. That's also where you'll pick who you want and message them." },
        { t: "Watch your email", b: "We'll email you the moment an estimate arrives, so you don't have to keep checking." },
        { t: "Nothing in your inbox? Check spam", b: <>Our mail comes from <Strong>noreply@freddyfixit.ca</Strong>. If it landed in spam, marking it “not spam” once keeps the rest coming through.</> },
      ]
    : [
        { t: "Click the link in your email", b: <>We’ve sent it to <Strong>{email}</Strong>. Your account isn’t active until you click it, so nothing else can happen first.</> },
        { t: "Can't find it? Check your spam folder", b: <>It comes from <Strong>noreply@freddyfixit.ca</Strong> and can take a couple of minutes. Still nothing after that, reply to any of our emails or write to <Strong>hello@freddyfixit.ca</Strong> and we’ll sort it out — you won’t be stuck.</> },
        { t: "Then sign in to your dashboard", b: "Your request is already posted and pros can already quote it. The dashboard is where those estimates show up and where you pick one." },
      ];
  return (
    <View style={{ marginTop: t.s5, padding: t.s5, borderRadius: t.r3, backgroundColor: rgba(t.fg, 0.04), borderWidth: t.hairW, borderColor: rgba(t.fg, 0.1) }}>
      <Txt variant="label" size={1.3} ls={0.05} accessibilityRole="header">What happens next</Txt>
      {steps.map((st, i) => (
        <View key={st.t} style={{ flexDirection: "row", gap: t.s3, paddingVertical: t.s3, borderTopWidth: i === 0 ? 0 : t.hairW, borderTopColor: rgba(t.fg, 0.08) }}>
          <View style={{ width: ui.progressDot, height: ui.progressDot, borderRadius: ui.pill, alignItems: "center", justifyContent: "center",
            backgroundColor: rgba(t.accentRgb, 0.14), borderWidth: ui.line, borderColor: rgba(t.accentRgb, 0.35) }}>
            <Txt variant="bodyBold" size={0.8} color={t.accent500}>{String(i + 1)}</Txt>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="bodyBold" size={0.88} style={{ marginBottom: ui.nudge2 }}>{st.t}</Txt>
            <Txt size={0.88} lh={1.6} color={rgba(t.muted, 0.75)}>{st.b}</Txt>
          </View>
        </View>
      ))}
    </View>
  );
}

