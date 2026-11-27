// Scroll targets on the job screen: the native form of web's anchor ids
// (CONTRACT_ANCHOR, ADDRESS_ANCHOR, "ffc-confirm" ...). An attention row lands on
// the CONTROL it names, never the top of the card (web CLAUDE.md).
//
// Web rules carried over:
//   · Every render branch of a target carries its anchor, INCLUDING loading. A tap
//     usually lands before the read resolves; an anchor missing there scrolls to
//     nothing, silently. (ContractPanel wraps all of its branches in <Anchor>.)
//   · The ids are bare, not keyed per job: the screen shows one job.
//   · A target that isn't on screen falls back to the top, never a dead tap.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { View, type HostInstance, type ScrollViewInstance } from "react-native";
import { rgba, ui, useTheme } from "@/kit";

/** Every control an attention row can point at. One list, so a row can't name a target that doesn't exist. */
export const JOB_ANCHORS = ["contract", "address", "confirm", "price", "hike", "sched", "walkthrough", "repost"] as const;
export type JobAnchorId = (typeof JOB_ANCHORS)[number];
export const CONTRACT_ANCHOR: JobAnchorId = "contract";
export const ADDRESS_ANCHOR: JobAnchorId = "address";

export const isJobAnchor = (v: unknown): v is JobAnchorId => typeof v === "string" && (JOB_ANCHORS as readonly string[]).includes(v);

type Ctx = {
  register: (id: JobAnchorId, ref: React.RefObject<HostInstance | null>) => () => void;
  pulse: JobAnchorId | null;
};
const AnchorCtx = createContext<Ctx | null>(null);

const PULSE_MS = 4500; // web: the ring lasts ~4.5s

/**
 * Owns the anchor registry for one screen. `content` is the View every anchor is
 * measured against (the ScrollView's only child); `scroll` is the ScrollView.
 */
export function useAnchorHost(scroll: React.RefObject<ScrollViewInstance | null>, content: React.RefObject<HostInstance | null>) {
  const { t, reduceMotion } = useTheme();
  const refs = useRef(new Map<JobAnchorId, React.RefObject<HostInstance | null>>());
  const [pulse, setPulse] = useState<JobAnchorId | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const register = useCallback((id: JobAnchorId, ref: React.RefObject<HostInstance | null>) => {
    refs.current.set(id, ref);
    return () => { if (refs.current.get(id) === ref) refs.current.delete(id); };
  }, []);

  /** Scroll to the control and ring it. Falls back to the top when it isn't rendered. */
  const focus = useCallback((id: JobAnchorId) => {
    setPulse(id);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPulse(null), PULSE_MS);
    const target = refs.current.get(id)?.current;
    const host = content.current;
    const toTop = () => scroll.current?.scrollTo({ y: 0, animated: !reduceMotion });
    if (!target || !host) return toTop();
    target.measureLayout(host, (_x, y) => scroll.current?.scrollTo({ y: Math.max(0, y - t.s4), animated: !reduceMotion }), toTop);
  }, [content, scroll, reduceMotion, t.s4]);

  const value = useMemo(() => ({ register, pulse }), [register, pulse]);
  return { focus, value };
}

/** Wrap the screen's content: `<AnchorProvider value={host.value}>`. (A stable component, so a pulse never remounts a form.) */
export const AnchorProvider = AnchorCtx.Provider;

/** A scroll target. Rings for a few seconds when an attention row sent the person here. */
export function Anchor({ id, children }: { id: JobAnchorId; children: React.ReactNode }) {
  const { t } = useTheme();
  const ctx = useContext(AnchorCtx);
  const ref = useRef<HostInstance>(null);
  const register = ctx?.register;
  useEffect(() => (register ? register(id, ref) : undefined), [register, id]);
  const on = ctx?.pulse === id;
  return (
    <View ref={ref} collapsable={false}
      style={{ borderRadius: t.r3, borderWidth: ui.edge, borderColor: on ? t.accentLine : "transparent", backgroundColor: on ? rgba(t.accentRgb, 0.04) : "transparent" }}>
      {children}
    </View>
  );
}
