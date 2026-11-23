// NATIVE OVERRIDE of web src/lib/bus.ts (web prereq W2, PLAN.md §2.3).
// Web emits window CustomEvents; React Native has no window events, so this is a
// plain in-memory emitter with the same API. Event names stay identical to web.
type Fn = (detail?: unknown) => void;
const subs = new Map<string, Set<Fn>>();

export function emit(name: string, detail?: unknown): void {
  subs.get(name)?.forEach((fn) => {
    try { fn(detail); } catch (e) { if (__DEV__) console.warn(`bus ${name}:`, e); }
  });
}

/** Subscribe; returns the unsubscribe function (use it as a useEffect cleanup). */
export function on(name: string, fn: Fn): () => void {
  let set = subs.get(name);
  if (!set) subs.set(name, (set = new Set()));
  set.add(fn);
  return () => { set!.delete(fn); };
}
