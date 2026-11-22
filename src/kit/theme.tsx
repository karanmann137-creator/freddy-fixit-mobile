// The native face of the web's --ff-* tokens. PLAN.md §3.1.
//
// Every value comes from tokens.generated.ts (parsed from web main.tsx by
// `npm run sync`). No colour or spacing literal belongs anywhere else in src/;
// scripts/check-rules.mjs fails CI on one.
//
// Three token sets, same as web: dark (default), light (opt-in), and onDark,
// the forced-navy scope (web `.ff-on-dark`) used by the Pass. In light theme
// onDark only applies with `anchor`, matching web's `.ff-on-dark.ff-anchor`.
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { rawTokens } from "./tokens.generated";
import { getTheme, getTextScale, PREFS_CHANGED, type Theme } from "@/lib/theme";
import { on } from "@/lib/bus";

type Raw = Record<keyof typeof rawTokens.dark, string>;

const px = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const triplet = (v: string) => v.split(",").map((x) => parseInt(x, 10)) as [number, number, number];

function build(raw: Raw) {
  return {
    // colours (strings React Native accepts as-is)
    text: raw.text, bg: raw.bg, surface: raw.surface, surface2: raw.surface2, surface0e: raw.surface0e,
    success: raw.success, warn: raw.warn, danger: raw.danger, info: raw.info,
    accent600: raw.accent600, accent500: raw.accent500, accent400: raw.accent400,
    accentSoft: raw.accentSoft, accentLine: raw.accentLine,
    ink1: raw.ink1, ink2: raw.ink2, ink3: raw.ink3, ink4: raw.ink4,
    hair: raw.hair, cardBg: raw.cardBg, cardBorder: raw.cardBorder, glass: raw.glass,
    // "r,g,b" triplets for rgba(): web writes rgba(var(--ff-fg), .07)
    fg: triplet(raw.fg), muted: triplet(raw.muted), bgRgb: triplet(raw.bgRgb), accentRgb: triplet(raw.accentRgb),
    successRgb: triplet(raw.successRgb), warnRgb: triplet(raw.warnRgb), dangerRgb: triplet(raw.dangerRgb),
    // geometry
    s1: px(raw.s1), s2: px(raw.s2), s3: px(raw.s3), s4: px(raw.s4), s5: px(raw.s5), s6: px(raw.s6), s8: px(raw.s8), s10: px(raw.s10),
    r1: px(raw.r1), r2: px(raw.r2), r3: px(raw.r3), r4: px(raw.r4),
    hRow: px(raw.hRow), gut: px(raw.gut),
    // web --ff-h-ctl is 44 (iOS). Native floor is 48dp so it also meets Android's guideline. PLAN §3.2.
    hCtl: Math.max(48, px(raw.hCtl)),
    hairW: Math.max(0.5, px(raw.hairW)),
  };
}
export type Tokens = ReturnType<typeof build>;

const SETS = { dark: build(rawTokens.dark), light: build(rawTokens.light), onDark: build(rawTokens.onDark) };

/** rgba(t.fg, .07): the native form of web `rgba(var(--ff-fg), .07)`. */
export const rgba = ([r, g, b]: readonly [number, number, number], a: number) => `rgba(${r},${g},${b},${a})`;

/** Parsed cubic-bezier control points for Reanimated's Easing.bezier(...). */
const bez = (v: string) => (v.match(/[-0-9.]+/g) ?? []).map(Number) as [number, number, number, number];
export const ease = {
  out: bez(rawTokens.dark.easeOut),
  inOut: bez(rawTokens.dark.easeInOut),
  drawer: bez(rawTokens.dark.easeDrawer),
  spring: bez(rawTokens.dark.easeSpring),
};

export const fonts = {
  label: "BebasNeue_400Regular", // headings, labels, chips, numerals, buttons (brand doc)
  body: "DMSans_400Regular",
  bodyMedium: "DMSans_500Medium",
  bodyBold: "DMSans_700Bold",
  display: "Archivo_700Bold", // read-style screens only
};

type Ctx = { t: Tokens; scheme: Theme; scale: number; reduceMotion: boolean; onDark: boolean };
const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [scheme, setScheme] = useState<Theme>(getTheme());
  const [scale, setScale] = useState(getTextScale());
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => on(PREFS_CHANGED, () => { setScheme(getTheme()); setScale(getTextScale()); }), []);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);
  const value = useMemo(() => ({ t: SETS[scheme], scheme, scale, reduceMotion, onDark: false }), [scheme, scale, reduceMotion]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

/** Forced-navy scope (web `.ff-on-dark`). In light theme it applies only with `anchor`. */
export function OnDark({ anchor, children }: { anchor?: boolean; children: React.ReactNode }) {
  const parent = useTheme();
  const active = parent.scheme === "dark" || !!anchor;
  const value = useMemo(() => (active ? { ...parent, t: SETS.onDark, onDark: true } : parent), [parent, active]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Ctx {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error("useTheme() outside <ThemeProvider>");
  return c;
}

/** Font size in px from the web's rem value, with the user's text-size setting.
 *  The OS Dynamic Type multiplier is applied on top by React Native itself. */
export function useFs() {
  const { scale } = useTheme();
  return (rem: number) => Math.round(rem * 16 * scale * 10) / 10;
}
