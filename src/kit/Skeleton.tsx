// Port of the useful half of web components/Skeleton.tsx.
// useDelayed: don't flash a skeleton for a read that finishes in 120ms.
// Stalled: after 12s of loading, say so with a way out instead of shimmering forever
// (web rule: a load that never ends is a dead end in disguise).
import React, { useEffect, useState } from "react";
import { View, type DimensionValue } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { rgba, ui, useTheme } from "./theme";
import { Txt } from "./Text";
import { Button } from "./Button";

export function Sk({ w = "100%", h = 12, r, circle }: { w?: DimensionValue; h?: number; r?: number; circle?: boolean }) {
  const { t, reduceMotion } = useTheme();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) { cancelAnimation(o); o.set(1); }
    else o.set(withRepeat(withTiming(0.45, { duration: 900 }), -1, true));
    return () => cancelAnimation(o);
  }, [reduceMotion, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[{ width: circle ? h : w, height: h, borderRadius: circle ? 99 : r ?? 6, backgroundColor: rgba(t.fg, 0.08) }, anim]} />;
}

export function SkText({ lines = 3, gap = 8 }: { lines?: number; gap?: number }) {
  return <View style={{ gap }}>{Array.from({ length: lines }, (_, i) => <Sk key={i} w={i === lines - 1 ? "62%" : "100%"} />)}</View>;
}

export function SkRow({ avatar = true }: { avatar?: boolean }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: t.s3, paddingVertical: t.s3, paddingHorizontal: t.s4 }}>
      {avatar && <Sk h={ui.skRow} circle />}
      <View style={{ flex: 1, gap: 6 }}><Sk w="70%" /><Sk w="40%" h={10} /></View>
    </View>
  );
}

/** true after `ms`, so a fast read never flashes a skeleton. */
export function useDelayed(ms = 120): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => { const id = setTimeout(() => setOn(true), ms); return () => clearTimeout(id); }, [ms]);
  return on;
}

/** Shows children until `after` ms, then a "taking longer than usual" notice with Retry. */
export function Stalled({ after = 12000, onRetry, children }: { after?: number; onRetry: () => void; children: React.ReactNode }) {
  const { t } = useTheme();
  const stalled = useDelayed(after);
  if (!stalled) return <>{children}</>;
  return (
    <View style={{ alignItems: "center", gap: t.s3, paddingVertical: t.s6 }}>
      <Txt color={t.ink3} style={{ textAlign: "center" }}>This is taking longer than usual. Check your connection, then try again.</Txt>
      <Button onPress={onRetry}>Try again</Button>
    </View>
  );
}
