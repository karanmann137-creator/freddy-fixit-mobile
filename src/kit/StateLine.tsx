// Port of web ui/StateLine.tsx. Four states, and only four:
//   turn   it is on YOU. Orange.
//   wait   it is on them. Neutral, deliberately NOT orange.
//   ok     done / settled. Green.
//   review we are looking at it. Amber.
//
// THE RULE THIS COMPONENT EXISTS TO ENFORCE: orange appears exactly once per
// screen, and only when the answer is "you". A screen where the client is
// waiting on a pro has no orange anywhere. Want a second orange thing? Use
// "wait" or a neutral pill.
//
// `pulse` is for "turn" only: a pulsing dot on something the person can't act
// on is an alarm with no off switch. Reduced motion stops it.
import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from "react-native-reanimated";
import { ease, rgba, ui, useTheme } from "./theme";
import { Txt } from "./Text";

export type State = "turn" | "wait" | "ok" | "review";

export function StateLine({ state, pulse, children }: { state: State; pulse?: boolean; children: React.ReactNode }) {
  const { t, reduceMotion } = useTheme();
  const o = useSharedValue(1);
  useEffect(() => {
    if (pulse && state === "turn" && !reduceMotion) {
      o.set(withRepeat(withTiming(0.35, { duration: 1100, easing: Easing.bezier(...ease.inOut) }), -1, true));
    } else { cancelAnimation(o); o.set(1); }
  }, [pulse, state, reduceMotion, o]);
  const dotAnim = useAnimatedStyle(() => ({ opacity: o.get() }));

  const c = {
    turn: { bg: t.accent400, fg: rgba(t.bgRgb, 1), bar: undefined as string | undefined, ring: false },
    wait: { bg: rgba(t.fg, 0.06), fg: t.text, bar: rgba(t.muted, 0.55), ring: true },
    ok: { bg: rgba(t.successRgb, 0.14), fg: t.success, bar: t.success, ring: false },
    review: { bg: rgba(t.warnRgb, 0.14), fg: t.warn, bar: t.warn, ring: false },
  }[state];

  return (
    <View accessibilityRole="text" style={{ flexDirection: "row", alignItems: "center", gap: t.s3, minHeight: t.hCtl, paddingHorizontal: t.s4,
      borderRadius: ui.stateRadius, backgroundColor: c.bg, marginBottom: t.s4, overflow: "hidden" }}>
      {c.bar && <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: ui.stateBar, backgroundColor: c.bar }} />}
      <Animated.View style={[{ width: ui.stateDot, height: ui.stateDot, borderRadius: 99 },
        c.ring ? { borderWidth: 2, borderColor: rgba(t.muted, 0.8) } : { backgroundColor: c.fg }, dotAnim]} />
      <Txt variant="label" size={1.1} color={c.fg} style={{ flex: 1 }}>{children}</Txt>
    </View>
  );
}
