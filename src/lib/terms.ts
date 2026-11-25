// NATIVE OVERRIDE of web src/lib/terms.ts. Same RPCs, same rules, same reasons.
// Read the web header for the why. The short version:
//   * The server stamps the version (`accept_terms(p_surface)` takes none).
//   * The gate FAILS OPEN on a failed read, deliberately. Do not "harden" it.
//   * The stash exists only for ticks made before email confirmation, and is
//     redeemed ONLY if it exists. A Google/Apple sign-in never ticked anything,
//     so it must never record consent.
// Native differences: storage is async (AsyncStorage), and the sheet is asked
// through the in-app bus instead of a window event. No synced file imports this,
// so the async signatures break nothing.
import { supabase } from "@/lib/supabase";
import { emit } from "@/lib/bus";
import { kvGet, kvRemove, kvSet } from "@/platform/storage";

export type TermsStatus = { ok: boolean; version: string | null; acceptedVersion: string | null; needed: boolean };
const UNKNOWN: TermsStatus = { ok: false, version: null, acceptedVersion: null, needed: false };
export const TERMS_GATE_EVENT = "ff:terms-gate";

let cachedUid: string | null = null;
let inflight: Promise<TermsStatus> | null = null;
let cached: TermsStatus | null = null;

export function clearTermsStatus() { cachedUid = null; inflight = null; cached = null; }

export async function termsStatus(): Promise<TermsStatus> {
  let uid: string | null = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    uid = session?.user?.id ?? null;
  } catch { return UNKNOWN; }
  if (!uid) return { ok: true, version: null, acceptedVersion: null, needed: false };
  if (cachedUid !== uid) clearTermsStatus();
  if (cached) return cached;
  if (inflight) return inflight;
  cachedUid = uid;
  inflight = (async () => {
    const { data, error } = await supabase.rpc("terms_status");
    if (error || !data || typeof data !== "object") { clearTermsStatus(); return UNKNOWN; } // never cache a failure
    const d = data as Record<string, unknown>;
    const val: TermsStatus = {
      ok: true,
      version: typeof d.version === "string" ? d.version : null,
      acceptedVersion: typeof d.accepted_version === "string" ? d.accepted_version : null,
      needed: d.needed === true,
    };
    if (cachedUid === uid) { cached = val; inflight = null; }
    return val;
  })();
  return inflight;
}

/** False = the write could not be confirmed. Never report success on a false. */
export async function acceptTerms(surface: string): Promise<boolean> {
  const { error } = await supabase.rpc("accept_terms", { p_surface: surface });
  if (error) return false;
  clearTermsStatus();
  return true;
}

const PENDING_KEY = "ff_terms_pending";
const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function stashTermsConsent(surface: string): Promise<void> {
  await kvSet(PENDING_KEY, JSON.stringify({ surface, at: Date.now() }));
}
export async function clearStashedTermsConsent(): Promise<void> { await kvRemove(PENDING_KEY); }

/** Records a stashed tick if there is one and it isn't stale; with no stash it does nothing at all. */
export async function redeemStashedTermsConsent(): Promise<void> {
  const raw = await kvGet(PENDING_KEY);
  if (!raw) return;
  let surface = "signup";
  try {
    const d = JSON.parse(raw) as { surface?: unknown; at?: unknown };
    if (typeof d.at !== "number" || Date.now() - d.at > PENDING_TTL_MS) { await clearStashedTermsConsent(); return; }
    if (typeof d.surface === "string" && d.surface) surface = d.surface;
  } catch { await clearStashedTermsConsent(); return; }
  if (await acceptTerms(surface)) await clearStashedTermsConsent(); // left in place on a failed write, to retry
}

// The blocking gate. Like web, it FAILS OPEN when no sheet is mounted (the
// TermsSheet arrives with the first consequential action, Phase 4).
let sheetMounted = 0;
export function termsSheetMounted(on: boolean) { sheetMounted = Math.max(0, sheetMounted + (on ? 1 : -1)); }

export async function ensureTermsAccepted(surface: string): Promise<boolean> {
  const st = await termsStatus();
  if (!st.needed) return true;      // includes every failed read: fail open
  if (sheetMounted < 1) return true; // no sheet to ask with: fail open
  return new Promise<boolean>((resolve) => emit(TERMS_GATE_EVENT, { surface, version: st.version, resolve }));
}

// Any auth transition invalidates the cache. Synchronous only (auth-lock rule).
supabase.auth.onAuthStateChange((_event, session) => {
  if ((session?.user?.id ?? null) !== cachedUid) clearTermsStatus();
});
