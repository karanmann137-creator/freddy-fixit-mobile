// Port of web ui/DeadEnd.tsx: the screen a stuck person sees.
//
// ⚠️ THE ACTION IS NOT OPTIONAL. Every outage that reached a real person reached
// them as a blank screen or a redirect loop, because the code that hit the dead
// end had nowhere to say so. On native the type enforces what web only documents:
//   <DeadEnd msg onRetry />                  retry (default)
//   <DeadEnd msg retry={false} alt={...} />  a REFUSAL: retrying fails the same
//                                            way forever, so `alt` is required
// There is no way to render it with neither.
import React from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTheme, rgba, ui } from "./theme";
import { Txt, isTextLike } from "./Text";
import { Button } from "./Button";

type Props =
  | { msg: string; retry?: true; retryLabel?: string; onRetry: () => void; alt?: React.ReactNode }
  | { msg: string; retry: false; alt: React.ReactNode };

export function DeadEnd(p: Props) {
  const { t } = useTheme();
  const hasAlt = p.alt != null && p.alt !== false && p.alt !== "";
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: t.s4, padding: t.s6 }}>
        <Txt lh={1.6} style={{ textAlign: "center", maxWidth: ui.readMax }}>{p.msg}</Txt>
        {p.retry !== false && (
          <Button variant="primary" onPress={p.onRetry}>{p.retryLabel ?? "Try again"}</Button>
        )}
        {/* Belt and braces for a cast around the type: a refusal with no alt still gets a way out. */}
        {p.retry === false && !hasAlt && <Button onPress={() => router.replace("/")}>Go home</Button>}
        {hasAlt && (isTextLike(p.alt)
          ? <Txt size={0.85} color={rgba(t.muted, 0.7)} style={{ textAlign: "center" }}>{p.alt}</Txt>
          : p.alt)}
      </View>
    </SafeAreaView>
  );
}
