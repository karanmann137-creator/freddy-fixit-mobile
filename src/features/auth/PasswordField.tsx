// Port of web components/PasswordField.tsx. Show/hide toggle; with `meter`, the
// strength bar and the breach check (synced passwordStrength.ts; the SHA-1 it
// needs comes from platform/polyfills.ts).
// `onBreachChange(true)` fires only when HIBP DEFINITIVELY found the password;
// an unreachable HIBP is "not breached" (web rule). Every keystroke clears the
// flag first, so a submit can never be blocked on a stale answer.
import React, { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Field, Ic, Txt, rgba, ui, useTheme } from "@/kit";
import { checkPwned, formatBreachCount, scorePassword } from "@/lib/passwordStrength";

export function PasswordField({ label = "Password", value, onChangeText, meter, onBreachChange, error, newPassword, onSubmitEditing }: {
  label?: string; value: string; onChangeText: (v: string) => void; meter?: boolean;
  onBreachChange?: (breached: boolean) => void; error?: string | null; newPassword?: boolean; onSubmitEditing?: () => void;
}) {
  const { t } = useTheme();
  const [show, setShow] = useState(false);
  const [breach, setBreach] = useState<number | null>(null);
  const cb = useRef(onBreachChange);
  useEffect(() => { cb.current = onBreachChange; }, [onBreachChange]);

  // A new keystroke invalidates the last answer. Cleared in the change handler (not the
  // effect), so a parent can never block a submit on a stale result.
  const change = (v: string) => { setBreach(null); cb.current?.(false); onChangeText(v); };

  useEffect(() => {
    if (!meter) return;
    if (!value || value.length < 8) return;
    const ctrl = new AbortController();
    let alive = true;
    const timer = setTimeout(() => {
      checkPwned(value, ctrl.signal).then((n) => {
        if (!alive) return;
        setBreach(n);
        cb.current?.(typeof n === "number" && n > 0);
      });
    }, 500);
    return () => { alive = false; clearTimeout(timer); ctrl.abort(); };
  }, [value, meter]);

  const st = meter && value ? scorePassword(value) : null;
  const bar = st ? [t.danger, t.danger, t.warn, t.success, t.success][st.score] : t.hair;
  const breached = typeof breach === "number" && breach > 0;

  return (
    <View>
      <Field
        label={label}
        value={value}
        onChangeText={change}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete={newPassword ? "new-password" : "current-password"}
        textContentType={newPassword ? "newPassword" : "password"}
        onSubmitEditing={onSubmitEditing}
        error={error}
        right={
          <Pressable onPress={() => setShow((v) => !v)} accessibilityRole="button" accessibilityLabel={show ? "Hide password" : "Show password"}
            style={{ width: t.hCtl, height: t.hCtl, alignItems: "center", justifyContent: "center" }}>
            <Ic name={show ? "eye-off" : "eye"} size={ui.icon.lg} color={rgba(t.muted, 0.8)} />
          </Pressable>
        }
      />
      {st && (
        <View style={{ marginTop: t.s2, gap: t.s1 }}>
          <View style={{ flexDirection: "row", gap: t.s1 }}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ flex: 1, height: ui.meterH, borderRadius: ui.pill, backgroundColor: i < Math.max(1, st.score) ? bar : t.hair }} />
            ))}
          </View>
          <Txt size={0.78} color={rgba(t.muted, 0.7)}>{st.hint}</Txt>
        </View>
      )}
      {breached && (
        <Txt size={0.8} color={t.danger} style={{ marginTop: t.s2 }} accessibilityLiveRegion="polite">
          {`Please choose a different password. This one has appeared in public data breaches ${formatBreachCount(breach!)}, so attackers already have it on a list. It was checked without ever leaving your device.`}
        </Txt>
      )}
    </View>
  );
}
