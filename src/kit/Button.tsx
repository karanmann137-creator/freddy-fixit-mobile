// Port of web ui/Button.tsx + .ffu-btn (uiStyles.ts). PLAN.md §3.3.
//
// The press: scale 0.97 on the way down (fast, ease-out), and back up on the
// brand spring (--ff-ease-spring), asymmetric like web. A symmetric press reads
// as mushy. Reduced motion → no scale at all.
//
// `loading` shows a spinner AND blocks the press, keeping the label visible so
// the button doesn't change width mid-interaction (web rule).
//
// Orange (`primary`) appears at most once per screen. If you want a second one,
// the answer is `secondary`.
import React from "react";
import { ActivityIndicator, Pressable, View, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ease, rgba, ui, useTheme } from "./theme";
import { Txt } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonBase = {
  variant?: ButtonVariant;
  full?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  /** Stable id: the native counterpart of web's anchor `id`. Set it on every render branch. */
  testID?: string;
  style?: ViewStyle;
};
/** A text button names itself. Anything else (an icon) MUST pass accessibilityLabel: enforced by the type. */
type ButtonProps = ButtonBase & ({ children: string; accessibilityLabel?: string } | { children: React.ReactElement; accessibilityLabel: string });

export function Button({ variant = "secondary", full, loading, disabled, onPress, children, accessibilityLabel, testID, style }: ButtonProps) {
  const { t, reduceMotion } = useTheme();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const off = disabled || loading;

  const skin: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: t.accent500, fg: "#fff" }, // rule-ok: web .ffu-pri uses #fff on orange in both themes
    secondary: { bg: t.cardBg, fg: t.text, border: t.cardBorder },
    ghost: { bg: "transparent", fg: t.text, border: t.hair },
    danger: { bg: "transparent", fg: t.danger, border: rgba(t.dangerRgb, 0.32) },
  };
  const s = skin[variant];

  return (
    <Animated.View style={[full ? { alignSelf: "stretch" } : { alignSelf: "flex-start" }, anim, style]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: !!off, busy: !!loading }}
        disabled={off}
        onPressIn={() => {
          if (!reduceMotion) scale.set(withTiming(0.97, { duration: 100, easing: Easing.bezier(...ease.out) }));
        }}
        onPressOut={() => {
          if (!reduceMotion) scale.set(withTiming(1, { duration: 340, easing: Easing.bezier(...ease.spring) }));
        }}
        onPress={() => {
          if (variant === "primary") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress?.();
        }}
        style={{
          minHeight: t.hCtl, borderRadius: t.r3, paddingHorizontal: t.s5,
          backgroundColor: s.bg, borderWidth: s.border ? (variant === "danger" ? ui.line : t.hairW) : 0, borderColor: s.border,
          flexDirection: "row", alignItems: "center", justifyContent: "center", gap: t.s2,
          opacity: off && !loading ? 0.5 : 1,
        }}
      >
        {loading && <ActivityIndicator size="small" color={s.fg} />}
        {typeof children === "string" ? <Txt variant="label" color={s.fg}>{children}</Txt> : children}
      </Pressable>
    </Animated.View>
  );
}

/** Two side-by-side buttons, equal width; put the primary on the RIGHT (thumb side). */
export function ButtonRow({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: t.s3, marginTop: t.s4 }}>
      {React.Children.map(children, (c) => <View style={{ flex: 1, minWidth: 0 }}>{c}</View>)}
    </View>
  );
}

/** Vertically stacked full-width buttons, primary first. */
export function Stack({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  return <View style={{ gap: t.s3, marginTop: t.s5, alignItems: "stretch" }}>{children}</View>;
}
