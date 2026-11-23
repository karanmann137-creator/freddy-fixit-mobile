// Port of web src/components/Ic.tsx. Glyph paths are generated from the web file
// (Lucide, ISC) by `npm run sync`, so the two icon sets cannot drift.
// Same gotcha as web: a name with no glyph renders blank, so dev builds warn.
import React from "react";
import Svg, { Path, Rect, Circle, Polyline, Polygon, Line, Ellipse } from "react-native-svg";
import { glyphs, type IconName } from "./glyphs.generated";
import { ui, useTheme } from "./theme";

export type { IconName };

const TAGS = { path: Path, rect: Rect, circle: Circle, polyline: Polyline, polygon: Polygon, line: Line, ellipse: Ellipse } as const;

export function Ic({ name, size = ui.icon.lg, color, rotate }: { name: IconName; size?: number; color?: string; rotate?: number }) {
  const { t } = useTheme();
  const shapes = glyphs[name];
  if (!shapes && __DEV__) console.warn(`Ic: no glyph "${name}"`);
  const stroke = color ?? t.text;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={ui.iconStroke}
      strokeLinecap="round" strokeLinejoin="round" style={rotate ? { transform: [{ rotate: `${rotate}deg` }] } : undefined}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {(shapes ?? []).map(([tag, attrs], i) => {
        const El = TAGS[tag] as unknown as React.ComponentType<Record<string, string>>;
        const a = { ...attrs } as Record<string, string>;
        if (a.fill === "currentColor") a.fill = stroke; // the `key` glyph
        return <El key={String(i)} {...a} />;
      })}
    </Svg>
  );
}
