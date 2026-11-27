// "An attention button lands on the CONTROL it names, never the top of the card"
// (web focusJobAnchor / ringAnchor / jobAnchor, ContractorDashboard.tsx:317-376).
//
// Native shape: the job screen owns one ScrollView. Each section that a row can
// target is wrapped in <Anchor id=…>; scrollToAnchor(id) measures that view
// against the scroll content and scrolls it into view, then rings it for 4.5s
// (web's pulse). A section that isn't on screen for this job's state has no
// anchor, so the scroll falls back to the top (web: "somewhere beats nowhere").
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform, RefreshControl, ScrollView, View, KeyboardAvoidingView, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ui, useTheme } from "@/kit";

type ViewRef = React.ComponentRef<typeof View>;
type ScrollRef = React.ComponentRef<typeof ScrollView>;

type Ctx = {
  pulse: string | null;
  register: (id: string, v: ViewRef | null) => void;
  scrollToAnchor: (id: string, delay?: number) => void;
};
const AnchorCtx = createContext<Ctx | null>(null);

export function useAnchors(): Ctx {
  const c = useContext(AnchorCtx);
  if (!c) throw new Error("useAnchors outside AnchorScroll");
  return c;
}

/** The job screen's scroll container (same frame as kit Screen) plus the anchor registry. */
export function AnchorScroll({ children, onRefresh, focus }: { children: React.ReactNode; onRefresh: () => Promise<unknown>; focus?: string | null }) {
  const { t, reduceMotion } = useTheme();
  const scroll = useRef<ScrollRef | null>(null);
  const content = useRef<ViewRef | null>(null);
  const views = useRef<Record<string, ViewRef | null>>({});
  const [pulse, setPulse] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const register = useCallback((id: string, v: ViewRef | null) => { views.current[id] = v; }, []);
  const scrollToAnchor = useCallback((id: string, delay = 250) => {
    setPulse(id);
    timers.current.push(setTimeout(() => setPulse((p) => (p === id ? null : p)), 4500));
    // Wait for the sections to lay out (a section's own read can still be loading).
    timers.current.push(setTimeout(() => {
      const v = views.current[id];
      const box = content.current;
      if (!v || !box) { scroll.current?.scrollTo({ y: 0, animated: !reduceMotion }); return; }
      v.measureLayout(box, (_x: number, y: number) => scroll.current?.scrollTo({ y: Math.max(0, y - t.s4), animated: !reduceMotion }),
        () => scroll.current?.scrollTo({ y: 0, animated: !reduceMotion }));
    }, delay));
  }, [reduceMotion, t.s4]);

  useEffect(() => {
    if (focus) void Promise.resolve().then(() => scrollToAnchor(focus, 400));
  }, [focus, scrollToAnchor]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  return (
    <AnchorCtx.Provider value={{ pulse, register, scrollToAnchor }}>
      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: t.bg }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: t.s4, paddingBottom: t.s10 }}
            refreshControl={<RefreshControl refreshing={refreshing} tintColor={t.text}
              onRefresh={async () => { setRefreshing(true); try { await onRefresh(); } catch { /* the screen shows its own failure */ } finally { setRefreshing(false); } }} />}>
            <View ref={content} collapsable={false}>{children}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AnchorCtx.Provider>
  );
}

/** A section an attention row can land on. Rings (accent border) while pulsed. */
export function Anchor({ id, children, style }: { id: string; children: React.ReactNode; style?: ViewStyle }) {
  const { t } = useTheme();
  const { pulse, register } = useAnchors();
  const on = pulse === id;
  return (
    <View ref={(v) => register(id, v)} collapsable={false} testID={id}
      style={[{ borderRadius: t.r3, borderWidth: ui.edge, borderColor: on ? t.accent400 : "transparent", marginTop: t.s4 }, style]}>
      {children}
    </View>
  );
}
