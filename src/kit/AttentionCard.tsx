// Port of web ui/AttentionCard.tsx. Renders nothing when there's nothing to do.
// `max`: 3 rows for clients, 4 for contractors (web rule). Put money-gating rows
// first: the cap drops from the bottom, never silently from the top.
import React from "react";
import { View } from "react-native";
import { rgba, ui, useTheme } from "./theme";
import { Txt } from "./Text";
import { Ic } from "./Ic";
import { Row } from "./Row";

export function AttentionCard({ children, title = "NEEDS YOUR ATTENTION", max = 3 }: { children: React.ReactNode; title?: string; max?: number }) {
  const { t } = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean).slice(0, max);
  if (rows.length === 0) return null;
  return (
    <View style={{ backgroundColor: t.accentSoft, borderWidth: ui.line, borderColor: t.accentLine, borderRadius: t.r3, overflow: "hidden", marginTop: t.s5 }}>
      <View accessibilityRole="header" style={{ flexDirection: "row", alignItems: "center", gap: t.s2, paddingVertical: t.s3, paddingHorizontal: t.s4, borderBottomWidth: ui.line, borderBottomColor: t.accentLine }}>
        <Ic name="alert-triangle" size={ui.icon.sm} color={t.accent500} />
        <Txt variant="label" size={0.78} color={t.accent500} ls={0.11}>{title}</Txt>
      </View>
      {rows.map((r, i) => (React.isValidElement(r) && r.type === Row
        ? React.cloneElement(r as React.ReactElement<{ _first?: boolean }>, { _first: i === 0 })
        : r))}
    </View>
  );
}

export function TrustLine({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: t.s3, alignItems: "flex-start", marginTop: t.s5, paddingVertical: t.s3, paddingHorizontal: t.s4,
      borderRadius: t.r2, backgroundColor: rgba(t.successRgb, 0.08), borderWidth: ui.line, borderColor: rgba(t.successRgb, 0.2) }}>
      <View style={{ marginTop: ui.nudge }}><Ic name="check-circle" size={ui.icon.lg} color={t.success} /></View>
      <Txt size={0.82} color={rgba(t.muted, 0.95)} lh={1.5} style={{ flex: 1 }}>{children}</Txt>
    </View>
  );
}
