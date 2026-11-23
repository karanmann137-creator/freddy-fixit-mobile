// Port of web ui/Pass.tsx + ui/Hero.tsx + ui/Mark.tsx: the navy "pass" at the top
// of a dashboard, with the brand mark, the hero line and the meta strip.
// forceNavy (default) wraps children in the onDark token scope, so the Pass stays
// navy in light theme too (web `.ff-on-dark.ff-anchor`).
import React from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import Svg, { Defs, Path, Polygon, RadialGradient, Rect, Stop } from "react-native-svg";
import { OnDark, rgba, ui, useTheme } from "./theme";
import { Txt, isTextLike } from "./Text";

/** The logo mark. Brand colours are fixed by design, not themed. */
export function Mark({ size = ui.mark }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect width="80" height="80" rx="18" fill="#1a2236" /* rule-ok: logo brand colours are fixed */ />
      <Polygon points="65.9,50.7 50.7,65.9 29.3,65.9 14.1,50.7 14.1,29.3 29.3,14.1 50.7,14.1 65.9,29.3"
        fill="rgba(234,107,20,0.14)" stroke="#ea6b14" strokeWidth={3} /* rule-ok: logo brand colours are fixed */ />
      <Path d="M28 54 L28 38 L40 28 L52 38 L52 54 Z" fill="none" stroke="#f0f4ff" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" /* rule-ok: logo brand colours are fixed */ />
      <Path d="M36 54 L36 43 L44 43 L44 54" fill="none" stroke="#ea6b14" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" /* rule-ok: logo brand colours are fixed */ />
    </Svg>
  );
}

function PassBody({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { t } = useTheme();
  return (
    <View style={[{ backgroundColor: t.surface2, paddingTop: t.s5, paddingHorizontal: t.s4, paddingBottom: t.s4, overflow: "hidden" }, style]}>
      {/* web .ffu-pass::after: radial accent glow, top right */}
      <Svg style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%" pointerEvents="none">
        <Defs>
          <RadialGradient id="ffglow" cx="88%" cy="-18%" rx="120%" ry="80%">
            <Stop offset="0" stopColor={rgba(t.accentRgb, 1)} stopOpacity={0.2} />
            <Stop offset="0.62" stopColor={rgba(t.accentRgb, 1)} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#ffglow)" />
      </Svg>
      {children}
    </View>
  );
}

export function Pass({ children, forceNavy = true, style }: { children: React.ReactNode; forceNavy?: boolean; style?: ViewStyle }) {
  return forceNavy
    ? <OnDark anchor><PassBody style={style}>{children}</PassBody></OnDark>
    : <PassBody style={style}>{children}</PassBody>;
}

export function PassTop({ children, lead, showWordmark = true, markSize = ui.mark }: { children?: React.ReactNode; lead?: React.ReactNode; showWordmark?: boolean; markSize?: number }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: t.s3, marginBottom: t.s5 }}>
      {lead ?? (
        <>
          <Mark size={markSize} />
          {showWordmark && (
            <Txt variant="label" size={1} ls={0.12} accessibilityRole="header">
              FREDDY <Txt variant="label" size={1} ls={0.12} color={t.accent500}>FIX IT</Txt>
            </Txt>
          )}
        </>
      )}
      <View style={{ flex: 1 }} />
      {children}
    </View>
  );
}

/** Round 48dp icon button with an optional badge (0, "", null hide it). `label` is required: it's the only name a screen reader gets. */
export function IconButton({ label, badge, onPress, children }: { label: string; badge?: string | number | null; onPress?: () => void; children: React.ReactNode }) {
  const { t, reduceMotion } = useTheme();
  const showBadge = badge !== null && badge !== undefined && badge !== 0 && badge !== "";
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={showBadge ? `${label}, ${badge}` : label}
      style={({ pressed }) => ({ width: t.hCtl, height: t.hCtl, borderRadius: ui.pill, alignItems: "center", justifyContent: "center",
        backgroundColor: rgba(t.fg, 0.07), borderWidth: t.hairW, borderColor: t.hair, transform: [{ scale: pressed && !reduceMotion ? 0.97 : 1 }] })}>
      {children}
      {showBadge && (
        <View style={{ position: "absolute", top: -ui.edge, right: -ui.edge, minWidth: ui.badge, height: ui.badge, paddingHorizontal: t.s1, borderRadius: ui.pill,
          backgroundColor: t.accent500, borderWidth: ui.edge, borderColor: t.surface2, alignItems: "center", justifyContent: "center" }}>
          <Txt variant="label" size={0.62} color="#fff" /* rule-ok: web badge text is white */>{String(badge)}</Txt>
        </View>
      )}
    </Pressable>
  );
}

export function Hero({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  return <Txt variant="bodyMedium" size={1.42} accessibilityRole="header" lh={1.26} ls={-0.03} style={{ marginBottom: t.s2 }}>{children}</Txt>;
}

export function HeroSub({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  return <Txt size={0.9} color={rgba(t.muted, 0.92)} lh={1.5}>{children}</Txt>;
}

export function PassMeta({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  return <View style={{ flexDirection: "row", gap: t.s5, marginTop: t.s5, paddingTop: t.s4, borderTopWidth: t.hairW, borderTopColor: t.hair }}>{children}</View>;
}

export function PassMetaItem({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  const { t } = useTheme();
  return (
    <View style={{ minWidth: 0, flexShrink: 1 }}>
      <Txt variant="label" size={0.72} color={rgba(t.muted, 0.7)} style={{ marginBottom: ui.nudge2 }}>{label}</Txt>
      {isTextLike(value)
        ? <Txt variant="label" size={1.02} color={accent ? t.accent400 : t.text} numberOfLines={1}>{value}</Txt>
        : value}
    </View>
  );
}
