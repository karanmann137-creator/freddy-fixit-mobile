// NATIVE OVERRIDE of web src/lib/requestDraft.ts. Same exports, same keys, same
// version, same age limit, same "worth offering" bar. Read the web header for the
// why; the short version:
//   * One key per form (signup vs signed-in): they hold different shapes and must
//     never cross-restore.
//   * NEVER saved: the password, the photo (a picker asset is a file handle, not
//     data), anything transient (errors, busy flags) and consent ticks.
//   * `enabled=false` from the moment a request is created, so a pending write can't
//     resurrect a request that already exists. clearDraft() runs after that.
//
// Native differences, each forced by the platform:
//   * Storage is AsyncStorage (platform/storage), so reads are async. readDraft()
//     and clearDraft() return promises, and useStoredDraft() reports `ready`: the
//     form must not mount (its useState initialisers read the draft) until it is.
//   * Web keeps the draft in sessionStorage, which dies with the tab. An app has no
//     tab, and PLAN 4.4 asks that a killed app resume, so the draft persists. The
//     12-hour age limit still applies, and the signed-in draft is cleared on
//     sign-out (features/auth/flow.ts) so the next person on a shared phone never
//     sees it: that is this platform's "end of the session".
import { useEffect, useState } from "react";
import { kvRead, kvRemove, kvSet } from "@/platform/storage";

/** One key per form. They hold different shapes and must never cross-restore. */
export const ONBOARDING_DRAFT_KEY = "ff_req_draft_signup";
export const NEWREQUEST_DRAFT_KEY = "ff_req_draft_return";

/** Bump when a saved shape stops being readable by the current form (web: v2, 2026-09-08). */
const DRAFT_VERSION = 2;

/** How long a draft stays offerable, in hours. */
const MAX_AGE_H = 12;

type Stored = { v: number; at: number; data: Record<string, unknown> };

function keysOf(o: Record<string, unknown>): string[] {
  return Object.keys(o);
}

/** Native only: the draft, and whether storage could be read at all. Never throws. */
async function readDraftResult(key: string): Promise<{ readFailed: boolean; draft: Record<string, unknown> | null }> {
  const r = await kvRead(key);
  if (!r.ok) return { readFailed: true, draft: null };
  try {
    if (!r.value) return { readFailed: false, draft: null };
    const p = JSON.parse(r.value) as Stored;
    if (!p || p.v !== DRAFT_VERSION || !p.data || typeof p.data !== "object") return { readFailed: false, draft: null };
    if (!Number.isFinite(p.at) || Date.now() - p.at > MAX_AGE_H * 3600_000) { await clearDraft(key); return { readFailed: false, draft: null }; }
    return { readFailed: false, draft: p.data };
  } catch { return { readFailed: false, draft: null }; } // unreadable JSON: nothing worth keeping
}

/** Read a draft, or null. Never throws: storage can fail and a lost draft must never break the form. */
export async function readDraft(key: string): Promise<Record<string, unknown> | null> {
  return (await readDraftResult(key)).draft;
}

export async function clearDraft(key: string): Promise<void> {
  await kvRemove(key); // never throws
}

async function writeDraft(key: string, data: Record<string, unknown>): Promise<void> {
  try {
    await kvSet(key, JSON.stringify({ v: DRAFT_VERSION, at: Date.now(), data } as Stored));
  } catch { /* a lost draft must never break the form */ }
}

/** Is there enough in this draft to be worth offering back? (web: same bar, word for word) */
export function draftWorthOffering(d: Record<string, unknown> | null): boolean {
  if (!d) return false;
  const desc = String(d.description ?? d.jobDescription ?? "").trim();
  if (desc.length >= 15) return true;
  const svc = Array.isArray(d.selectedServices) ? d.selectedServices.length : 0;
  if (!svc) return false;
  return keysOf(d).some(k => {
    if (k === "selectedServices" || k === "step") return false;
    const v = d[k];
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.length > 0;
    return false;
  });
}

/**
 * Debounced autosave (600ms, as web). `enabled` is what stops a draft being
 * re-written during and after submit: the caller flips it false the moment the
 * request is created, so the clearDraft() that follows can't be raced.
 */
export function useDraftAutosave(key: string, data: Record<string, unknown>, enabled: boolean) {
  const json = JSON.stringify(data);
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => { void writeDraft(key, JSON.parse(json) as Record<string, unknown>); }, 600);
    return () => clearTimeout(t);
  }, [key, enabled, json]);
}

/**
 * Read the draft ONCE, before the form mounts. The draft is RESTORED, not offered
 * (web rule): the form fills itself in, says so, and offers one way out.
 *
 * Native: `ready` is false until the read lands. Mount the form only when it is
 * true, so its useState initialisers see the draft. `startOver` hides the banner
 * and clears the stored copy; the caller remounts the form blank (web reloads).
 */
export function useStoredDraft(key: string) {
  const [read, setRead] = useState<{ ready: boolean; readFailed: boolean; draft: Record<string, unknown> | null }>({ ready: false, readFailed: false, draft: null });
  const [shown, setShown] = useState(true);
  useEffect(() => {
    let alive = true;
    void readDraftResult(key).then((r) => { if (alive) setRead({ ready: true, ...r }); });
    return () => { alive = false; };
  }, [key]);
  return {
    /** Restored values for the form's useState initialisers. May be null. */
    draft: read.draft,
    /** Native only: the read has landed (the form may mount). */
    ready: read.ready,
    /** Native only: false when storage couldn't be READ. The form still mounts blank (a lost
     *  draft never breaks it), but must not autosave over a draft it never saw. */
    saveable: !read.readFailed,
    /** Show the "we saved your progress" banner. */
    restored: shown && draftWorthOffering(read.draft),
    startOver: () => { setShown(false); void clearDraft(key); },
  };
}

/** Pull one string field out of a draft with a safe default. */
export function dStr(d: Record<string, unknown> | null, k: string, fb = ""): string {
  const v = d?.[k];
  return typeof v === "string" ? v : fb;
}

/** Pull one string-array field out of a draft with a safe default. */
export function dArr(d: Record<string, unknown> | null, k: string): string[] {
  const v = d?.[k];
  return Array.isArray(v) ? v.filter(x => typeof x === "string") as string[] : [];
}

/** Pull one number field, clamped to a range the caller still controls. */
export function dNum(d: Record<string, unknown> | null, k: string, fb: number, min: number, max: number): number {
  const v = Number(d?.[k]);
  if (!Number.isFinite(v)) return fb;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** Pull one boolean field. */
export function dBool(d: Record<string, unknown> | null, k: string, fb = false): boolean {
  const v = d?.[k];
  return typeof v === "boolean" ? v : fb;
}
