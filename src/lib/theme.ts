// NATIVE OVERRIDE of web src/lib/theme.ts: an intentional SUBSET (no synced file
// imports theme). Web-only names are absent on purpose: applyTheme/applyTextScale
// (they write to <html>), hasThemePreference, lightPeekEligible/markLightPeekUsed
// (the light peek lives on web reading pages). Same names and same defaults:
// dark is the default, light is opt-in, text scale defaults to 1.1 and is
// never lowered by default.
//
// Differences from web, both forced by the platform:
//   * Storage is async on native, so `initPrefs()` is async and must be awaited
//     once at launch (the root layout does it behind the splash screen). After
//     that `getTheme()` / `getTextScale()` are sync reads of the in-memory copy,
//     same as web.
//   * No light-mode "peek". That lives on the web's reading pages (About, Blog),
//     which the app doesn't have.
import { emit } from "@/lib/bus";
import { kvGet, kvSet } from "@/platform/storage";

export type Theme = "dark" | "light";

const THEME_KEY = "ff_theme";
const SCALE_KEY = "ff_text_scale";
export const PREFS_CHANGED = "ff:prefs-changed";

export const DEFAULT_SCALE = 1.1;
export const TEXT_SCALES = [1, 1.1, 1.25, 1.4] as const; // Small / Default / Large / Largest
export const SCALE_LABELS: Record<number, string> = { 1: "Small", 1.1: "Default", 1.25: "Large", 1.4: "Largest" };

let theme: Theme = "dark";
let scale: number = DEFAULT_SCALE;

export function getTheme(): Theme { return theme; }
export function getTextScale(): number { return scale; }

export function setTheme(t: Theme) {
  theme = t;
  void kvSet(THEME_KEY, t);
  emit(PREFS_CHANGED);
}
export function setTextScale(s: number) {
  scale = (TEXT_SCALES as readonly number[]).includes(s) ? s : DEFAULT_SCALE;
  void kvSet(SCALE_KEY, String(scale));
  emit(PREFS_CHANGED);
}

/** Await once at launch, before first paint, so there's no flash of the wrong theme. */
export async function initPrefs(): Promise<void> {
  const [t, s] = await Promise.all([kvGet(THEME_KEY), kvGet(SCALE_KEY)]);
  theme = t === "light" ? "light" : "dark";
  const v = parseFloat(s || String(DEFAULT_SCALE));
  scale = (TEXT_SCALES as readonly number[]).includes(v) ? v : DEFAULT_SCALE;
}
