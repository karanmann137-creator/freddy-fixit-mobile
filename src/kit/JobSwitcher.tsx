// Port of web ui/JobSwitcher.tsx: a horizontal strip of job "tabs" (a filter,
// not navigation). Hidden with fewer than 2 jobs unless alwaysShow. The dot
// follows StateLine's rule: orange only for "turn" (it's on you).
import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { rgba, useTheme } from "./theme";
import { Txt } from "./Text";

export type SwitcherJob = { id: string; label: string; state?: "turn" | "ok" | "wait" };

export function JobSwitcher({ jobs, activeId, onSelect, onNew, alwaysShow }: {
  jobs: SwitcherJob[]; activeId?: string | null; onSelect: (id: string) => void; onNew?: () => void; alwaysShow?: boolean;
}) {
  const { t } = useTheme();
  if (!alwaysShow && jobs.length < 2) return null;
  return (
    <View style={{ marginHorizontal: -t.s4, marginBottom: t.s4, borderBottomWidth: t.hairW, borderBottomColor: t.hair }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel="Your jobs"
        contentContainerStyle={{ paddingHorizontal: t.s4, gap: t.s6 }}>
        {jobs.map((j) => {
          const on = j.id === activeId;
          const dot = j.state === "turn" ? { backgroundColor: t.accent400, borderColor: t.accent400 }
            : j.state === "ok" ? { backgroundColor: t.success, borderColor: t.success }
            : { borderColor: rgba(t.fg, 0.3) };
          return (
            <Pressable key={j.id} onPress={() => onSelect(j.id)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={({ pressed }) => ({ height: t.hCtl, flexDirection: "row", alignItems: "center", gap: t.s2,
                borderBottomWidth: 2, borderBottomColor: on ? t.text : "transparent", transform: [{ scale: pressed ? 0.97 : 1 }] })}>
              <View style={[{ width: 7, height: 7, borderRadius: 99, borderWidth: 1.5 }, dot]} />
              <Txt variant="label" size={0.95} color={on ? t.text : rgba(t.muted, 0.75)}>{j.label}</Txt>
            </Pressable>
          );
        })}
        {onNew && (
          <Pressable onPress={onNew} accessibilityRole="button" accessibilityLabel="New request" style={{ height: t.hCtl, justifyContent: "center" }}>
            <Txt variant="label" size={0.95} color={rgba(t.muted, 0.6)}>+ NEW</Txt>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
