// A row of mutually exclusive choices (web's `seg` buttons). 48dp targets.
// Same shape as the one in the client Account screen, kept local so the two screens
// don't import each other's internals.
import React from "react";
import { Pressable, View } from "react-native";
import { Txt, rgba, useTheme } from "@/kit";

export function Segmented<V extends string | number>({ options, value, onChange, label }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void; label: string }) {
  const { t } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={{ flexGrow: 1, minHeight: t.hCtl, minWidth: t.hCtl * 1.4, alignItems: "center", justifyContent: "center", paddingHorizontal: t.s3, borderRadius: t.r3,
              borderWidth: t.hairW, borderColor: on ? t.text : t.hair, backgroundColor: on ? rgba(t.fg, 0.1) : rgba(t.fg, 0.04) }}>
            <Txt variant={on ? "bodyMedium" : "body"} size={0.88} color={on ? t.text : rgba(t.muted, 0.95)}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
