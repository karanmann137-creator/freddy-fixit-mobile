// Header for pushed screens (job detail, chat, settings): back + title + optional action.
// A tab's root screen passes back={false}: it has no "back", the tab bar is the way out.
// Back falls back to the role's home when there's no history (a deep link or push
// tap opened this screen cold), so it is never a dead button.
import React from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ui, useTheme } from "./theme";
import { Txt } from "./Text";
import { Ic } from "./Ic";
import { IconButton } from "./Pass";

export function ScreenHeader({ title, right, onBack, back: showBack = true }: { title: string; right?: React.ReactNode; onBack?: () => void; back?: boolean }) {
  const { t } = useTheme();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: t.s3, paddingVertical: t.s2, minHeight: t.hCtl }}>
      {showBack && <IconButton label="Back" onPress={back}><Ic name="chevron-down" size={ui.icon.xl} rotate={90} /></IconButton>}
      <Txt variant="label" size={1.25} numberOfLines={1} accessibilityRole="header" style={{ flex: 1 }}>{title}</Txt>
      {right}
    </View>
  );
}
