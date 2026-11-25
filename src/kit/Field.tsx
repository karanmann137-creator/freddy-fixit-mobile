// Labelled text input. The label is a real label (screen readers read it with the
// field), the error sits under the field it belongs to, and the input keeps a
// 48dp height and a 16-unit font (web's coarse-pointer floor).
import React, { useState } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { fonts, rgba, ui, useFs, useTheme } from "./theme";
import { Txt } from "./Text";

type Props = Omit<TextInputProps, "style"> & { label: string; error?: string | null; hint?: string; right?: React.ReactNode };

export function Field({ label, error, hint, right, onFocus, onBlur, ...input }: Props) {
  const { t } = useTheme();
  const fs = useFs();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginTop: t.s4 }}>
      <Txt variant="label" size={0.75} color={rgba(t.muted, 0.7)} style={{ marginBottom: t.s2 }}>{label.toUpperCase()}</Txt>
      <View style={{ flexDirection: "row", alignItems: "center", minHeight: t.hCtl, borderRadius: t.r2, borderWidth: t.hairW,
        borderColor: error ? t.danger : focused ? t.accentLine : rgba(t.fg, 0.12), backgroundColor: rgba(t.fg, 0.06) }}>
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={rgba(t.muted, 0.45)}
          selectionColor={t.accent500}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          {...input}
          style={{ flex: 1, minHeight: t.hCtl, paddingHorizontal: t.s4, color: t.text, fontFamily: fonts.body, fontSize: Math.max(ui.inputMin, fs(1)) }}
        />
        {right}
      </View>
      {error ? <Txt size={0.82} color={t.danger} style={{ marginTop: t.s2 }} accessibilityLiveRegion="polite">{error}</Txt>
        : hint ? <Txt size={0.78} color={rgba(t.muted, 0.6)} style={{ marginTop: t.s2 }}>{hint}</Txt> : null}
    </View>
  );
}

/** A message box for a form-level error or success, placed above the button that caused it. */
export function FormNote({ tone = "danger", children }: { tone?: "danger" | "good"; children: React.ReactNode }) {
  const { t } = useTheme();
  const c = tone === "danger" ? { fg: t.danger, rgb: t.dangerRgb } : { fg: t.success, rgb: t.successRgb };
  return (
    <View accessibilityLiveRegion="polite" style={{ marginTop: t.s4, padding: t.s3, borderRadius: t.r2, backgroundColor: rgba(c.rgb, 0.1), borderWidth: ui.line, borderColor: rgba(c.rgb, 0.25) }}>
      <Txt size={0.85} color={c.fg} lh={1.45}>{children}</Txt>
    </View>
  );
}
