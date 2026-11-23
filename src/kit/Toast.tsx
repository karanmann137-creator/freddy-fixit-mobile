// notify(): a short message at the top of the screen that goes away by itself.
// For confirmations ("Saved"), not for errors the person must act on. Those
// belong on the screen, next to the thing that failed, with a way to fix it.
// <ToastHost/> is mounted once in the root layout.
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { rgba, useTheme } from "./theme";
import { Txt } from "./Text";
import { Ic, type IconName } from "./Ic";

type Tone = "good" | "neutral" | "danger";
type Toast = { id: number; msg: string; tone: Tone };
let push: ((t: Toast) => void) | null = null;
let seq = 0;

export function notify(msg: string, tone: Tone = "good") {
  AccessibilityInfo.announceForAccessibility(msg);
  push?.({ id: ++seq, msg, tone });
}

export function ToastHost() {
  const { t, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const [cur, setCur] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    push = (next) => {
      setCur(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCur(null), 3200);
    };
    return () => { push = null; if (timer.current) clearTimeout(timer.current); };
  }, []);
  if (!cur) return null;
  const skin: Record<Tone, { icon: IconName; fg: string }> = {
    good: { icon: "check-circle", fg: t.success },
    neutral: { icon: "info", fg: t.text },
    danger: { icon: "alert-triangle", fg: t.danger },
  };
  const s = skin[cur.tone];
  return (
    <Animated.View key={cur.id} entering={reduceMotion ? undefined : FadeInUp} exiting={reduceMotion ? undefined : FadeOutUp}
      style={{ position: "absolute", top: insets.top + t.s2, left: t.s4, right: t.s4 }} pointerEvents="box-none">
      <Pressable onPress={() => setCur(null)} accessibilityRole="alert"
        style={{ flexDirection: "row", alignItems: "center", gap: t.s3, paddingVertical: t.s3, paddingHorizontal: t.s4,
          borderRadius: t.r3, backgroundColor: t.surface2, borderWidth: t.hairW, borderColor: t.cardBorder,
          shadowColor: rgba(t.bgRgb, 1), shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
        <Ic name={s.icon} size={18} color={s.fg} />
        <Txt size={0.92} style={{ flex: 1 }}>{cur.msg}</Txt>
      </Pressable>
    </Animated.View>
  );
}
