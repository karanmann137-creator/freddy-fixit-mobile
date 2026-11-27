// Small presentational pieces shared by the contractor job screen's sections.
// No reads, no writes, no rules: shapes only (tokens from the kit).
import React from "react";
import { View } from "react-native";
import { Ic, Txt, rgba, ui, useTheme, type IconName } from "@/kit";

/** Run a load after the effect returns, so an effect never sets state synchronously
 *  (react-hooks/set-state-in-effect). The load's own result handling is unchanged. */
export function defer(fn: () => unknown) { void Promise.resolve().then(fn); }

export type PanelTone = "neutral" | "accent" | "warn" | "good" | "info" | "danger";

/** web's tinted boxes: `rgba(var(--ff-<tone>-rgb), .07)` + a matching border. */
export function Panel({ tone = "neutral", children, dashed }: { tone?: PanelTone; children: React.ReactNode; dashed?: boolean }) {
  const { t } = useTheme();
  const rgb = tone === "accent" ? t.accentRgb : tone === "warn" ? t.warnRgb : tone === "good" ? t.successRgb : tone === "danger" ? t.dangerRgb : t.fg;
  const bg = tone === "neutral" || tone === "info" ? rgba(t.fg, 0.035) : rgba(rgb, 0.07);
  const border = tone === "neutral" ? rgba(t.fg, 0.1) : tone === "info" ? t.info : rgba(rgb, 0.34);
  return (
    <View style={{ padding: t.s4, gap: t.s3, borderRadius: t.r3, backgroundColor: bg, borderWidth: ui.line, borderColor: border, borderStyle: dashed ? "dashed" : "solid" }}>
      {children}
    </View>
  );
}

/** Small caps heading inside a panel (web's `.72rem uppercase` labels). */
export function PanelHead({ icon, color, children }: { icon: IconName; color?: string; children: string }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: t.s2 }}>
      <Ic name={icon} size={ui.icon.sm} color={color ?? t.accent500} />
      <Txt variant="label" size={0.82} ls={0.08} color={rgba(t.muted, 0.75)} style={{ flex: 1 }} accessibilityRole="header">{children}</Txt>
    </View>
  );
}

/** Body copy inside a panel. */
export function P({ children, color, strong }: { children: React.ReactNode; color?: string; strong?: boolean }) {
  const { t } = useTheme();
  return <Txt size={0.85} lh={1.55} variant={strong ? "bodyMedium" : "body"} color={color ?? rgba(t.muted, 0.9)}>{children}</Txt>;
}

/** An icon + one line of status (web's `<Ic/> Booked for …` lines). */
export function Line({ icon, color, children }: { icon: IconName; color?: string; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: t.s2, alignItems: "flex-start", marginTop: t.s4 }}>
      <View style={{ marginTop: ui.nudge2 }}><Ic name={icon} size={ui.icon.sm} color={color ?? t.text} /></View>
      <Txt size={0.88} lh={1.5} color={color ?? t.text} style={{ flex: 1 }}>{children}</Txt>
    </View>
  );
}

/** A label/value money row (web `pcRow`). Display only. */
export function MoneyRow({ label, value, strong, top }: { label: string; value: string; strong?: boolean; top?: boolean }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: t.s4, paddingVertical: t.s2,
      ...(top ? { borderTopWidth: t.hairW, borderTopColor: rgba(t.fg, 0.14), marginTop: t.s1 } : null) }}>
      <Txt size={0.84} color={rgba(t.muted, 0.8)} style={{ flex: 1 }}>{label}</Txt>
      <Txt size={strong ? 0.98 : 0.88} variant={strong ? "bodyBold" : "bodyMedium"}>{value}</Txt>
    </View>
  );
}

export function ErrLine({ children }: { children?: string | null }) {
  const { t } = useTheme();
  if (!children) return null;
  return <Txt size={0.84} lh={1.5} color={t.danger} accessibilityLiveRegion="polite">{children}</Txt>;
}
export function OkLine({ children }: { children?: string | null }) {
  const { t } = useTheme();
  if (!children) return null;
  return <Txt size={0.84} lh={1.5} color={t.success} accessibilityLiveRegion="polite">{children}</Txt>;
}
