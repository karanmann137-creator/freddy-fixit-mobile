// Port of web ui/Pill.tsx. Tones map to meaning, never decoration:
//   accent needs you · good settled/paid · warn in review · danger failed · neutral metadata
// "neutral" is the right answer far more often than it feels like it is.
import React from "react";
import { View } from "react-native";
import { rgba, ui, useTheme } from "./theme";
import { Txt, isTextLike } from "./Text";

export type PillTone = "accent" | "good" | "warn" | "danger" | "neutral";

export function Pill({ tone = "neutral", children }: { tone?: PillTone; children: React.ReactNode }) {
  const { t } = useTheme();
  const c = {
    accent: { bg: t.accentSoft, fg: t.accent500 },
    good: { bg: rgba(t.successRgb, 0.14), fg: t.success },
    warn: { bg: rgba(t.warnRgb, 0.14), fg: t.warn },
    danger: { bg: rgba(t.dangerRgb, 0.14), fg: t.danger },
    neutral: { bg: rgba(t.fg, 0.07), fg: rgba(t.muted, 0.9) },
  }[tone];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: t.s1, height: ui.pillH, paddingHorizontal: t.s2, borderRadius: ui.pill, backgroundColor: c.bg, alignSelf: "flex-start" }}>
      {isTextLike(children) ? <Txt variant="label" size={0.72} color={c.fg}>{children}</Txt> : children}
    </View>
  );
}
