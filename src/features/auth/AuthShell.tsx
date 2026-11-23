// The frame every sign-in screen shares: the wordmark, a title, a card.
import React from "react";
import { View } from "react-native";
import { Mark, Screen, Txt, rgba, ui, useTheme } from "@/kit";

export function AuthShell({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <Screen contentStyle={{ justifyContent: "center", flexGrow: 1 }}>
      <View style={{ width: "100%", maxWidth: ui.authMax, alignSelf: "center", paddingVertical: t.s8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: t.s3, marginBottom: t.s6 }}>
          <Mark size={ui.mark} />
          <Txt variant="label" size={1.6} ls={0.1}>FREDDY <Txt variant="label" size={1.6} ls={0.1} color={t.accent500}>FIX IT</Txt></Txt>
        </View>
        <View style={{ backgroundColor: rgba(t.fg, 0.04), borderWidth: t.hairW, borderColor: rgba(t.fg, 0.08), borderRadius: t.r3, padding: t.s5 }}>
          <Txt variant="label" size={1.7} ls={0.06} accessibilityRole="header">{title}</Txt>
          {sub ? <Txt size={0.88} color={rgba(t.muted, 0.7)} lh={1.5} style={{ marginTop: t.s1 }}>{sub}</Txt> : null}
          {children}
        </View>
      </View>
    </Screen>
  );
}
