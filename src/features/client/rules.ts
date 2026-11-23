// Pure derivations for the client home, ported from web ClientDashboard.tsx.
// No React, no I/O: the screen passes in what it read, so the pass, the attention
// card and the tab bar all read ONE answer (web: "one predicate, shared by every
// reader"; the pass and the card must read the same array).
import type { IconName, RowTone, State } from "@/kit";
import { jobIsLive } from "@/lib/jobStage";

// ── Tabs (web visibleNav, ClientDashboard.tsx:116) ─────────────────────────────
// My Pros appears only past 3 (up to 3 already show on the home tab on web; the
// app keeps the same threshold so both clients agree). Recurring and History are
// not tabs on a phone: they are Account rows, shown by the same counts.
export function clientNav(o: { pros: number; plans: number; past: number }) {
  return { pros: o.pros > 3, recurring: o.plans > 0, history: o.past > 0 };
}

export const isPastRequest = (r: any) => r?.status === "completed" || r?.status === "cancelled";

/** Web ClientDashboard.tsx:562: the picked request, else the first open one, else the newest. */
export function pickActiveRequest(requests: any[], selectedId: string | null) {
  const open = requests.filter((r) => !isPastRequest(r));
  return (selectedId && requests.find((r) => r.id === selectedId)) || open[0] || requests[0] || null;
}

/** A read the screen made for the active request: we know, we don't know, or not asked yet. */
export type Read<T> = { kind: "loading" } | { kind: "error" } | { kind: "ok"; value: T };

export type JobView = { job: any | null; proName: string | null };

/** A job the app can't manage yet (job screens are step 4.7): live and not settled. */
export function jobNeedsWeb(job: any | null): boolean {
  if (!job) return false;
  if (job.status === "completed" || job.payment_status === "released") return false;
  return jobIsLive(job) || job.status === "disputed";
}

// ── "Needs your attention" (web ClientDashboard.tsx:2146) ────────────────────
// ORDER MATTERS: only the first three render, money-gating rows first. The
// job-stage rows (agreement, address, balance, price, confirm, schedule, repost)
// need the job screen and the W1 predicates (PLAN §2.3), so they arrive with step
// 4.7. Until then a live job is handed to the website by the pass and the job card,
// and NO row below claims anything about a job's money.
export type AttnRow = {
  key: string; icon: IconName; tone: RowTone;
  hero: string; text: string; cta: string;
  action: "estimates" | "photo" | "settings";
};

export function attentionRows(o: {
  req: any | null;
  job: Read<JobView>;
  bids: Read<number>;
  refError: string;
}): AttnRow[] {
  const rows: AttnRow[] = [];
  const job = o.job.kind === "ok" ? o.job.value.job : null;
  // Estimates in, no pro picked yet. A failed bid read adds no row (the card says
  // it couldn't load); it never asserts "no estimates".
  if (o.job.kind === "ok" && !job && o.bids.kind === "ok" && o.bids.value > 0) {
    const n = o.bids.value;
    const who = n + " pro" + (n === 1 ? " has" : "s have");
    rows.push({ key: "bids", icon: "user-check", tone: "accent", hero: who + " sent you an estimate.", text: who + " bid on your request — pick the one you like.", cta: "See estimates", action: "estimates" });
  }
  // A live request with no photo: below every money row, scoped to `pending`.
  if (o.req?.status === "pending" && !o.req?.photo_path) {
    rows.push({ key: "photo", icon: "camera", tone: "warn", hero: "Add a photo and you'll get firmer prices.", text: "Your request has no photo — adding one usually turns a rough ballpark into a firm price.", cta: "Add a photo", action: "photo" });
  }
  // A referral code the server refused at signup. Peeked, not consumed: the
  // Settings box reads-and-clears it as it explains.
  if (o.refError) {
    rows.push({ key: "refcode", icon: "sparkles", tone: "neutral", hero: "Your referral code didn't apply.", text: o.refError + " You can enter another code in Settings.", cta: "Open Settings", action: "settings" });
  }
  return rows;
}

// ── The pass (web ClientDashboard.tsx:2301) ──────────────────────────────────
// ⚠️ THE ORANGE RULE: only "turn" paints orange, and only when attention rows exist.
// The pass reads `rows`, never re-derives "is anything on me".
export type PassView = {
  state: State; label: string; hero: string; sub?: string;
  meta: { label: string; value: string; accent?: boolean }[];
};

const money = (v: any) => "$" + Number(v ?? 0).toLocaleString("en-CA", { maximumFractionDigits: 0 });

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "the agreed time";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "the agreed time";
  return d.toLocaleString("en-CA", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Edmonton" });
}

export function passFor(o: { req: any | null; job: Read<JobView>; bids: Read<number>; rows: AttnRow[] }): PassView {
  const jv = o.job.kind === "ok" ? o.job.value : null;
  const job = jv?.job ?? null;
  const proName = jv?.proName || "Your pro";
  const proMeta = jv?.proName ? [{ label: "YOUR PRO", value: jv.proName }] : [];

  if (o.rows.length > 0) {
    const meta = [...proMeta];
    if (job?.amount) meta.push({ label: "JOB TOTAL", value: money(job.amount), accent: true } as any);
    return {
      state: "turn", label: "YOUR TURN", hero: o.rows[0].hero,
      sub: o.rows.length > 1 ? (o.rows.length - 1) + " other thing" + (o.rows.length === 2 ? "" : "s") + " below needs you too." : undefined,
      meta,
    };
  }
  if (!o.req) {
    return { state: "ok", label: "NOTHING OPEN", hero: "Nothing on the go right now.", sub: "Post a request and pros in your area will send you estimates.", meta: [] };
  }
  // We couldn't read the job: say so plainly rather than guess a state.
  if (o.job.kind === "error") {
    return { state: "wait", label: "COULDN'T CHECK", hero: "We couldn't load this request's job.", sub: "Pull down to try again.", meta: [] };
  }
  if (o.job.kind === "loading") {
    return { state: "wait", label: "CHECKING", hero: "Checking on your request…", meta: [] };
  }
  if (job && (job.status === "completed" || job.payment_status === "released")) {
    const meta = [...proMeta];
    if (job.amount) meta.push({ label: "PAID", value: money(job.amount) });
    return { state: "ok", label: "ALL DONE", hero: "This one's wrapped up.", sub: "Nothing outstanding. Post another request whenever you need one.", meta };
  }
  // A live job: the app can't yet tell whether money or a signature is owed (that
  // needs the job screen, step 4.7), so it neither says "your turn" nor "nothing
  // needed". It points at the one place that can answer.
  if (jobNeedsWeb(job)) {
    const meta = [...proMeta];
    if (job.scheduled_at) meta.push({ label: "ARRIVING", value: formatWhen(job.scheduled_at) });
    if (job.amount) meta.push({ label: "AGREED", value: money(job.amount) });
    return { state: "wait", label: "ON THE WEBSITE", hero: "Manage this job on freddyfixit.ca for now.", sub: proName + " is on it. Payments, the agreement and messages for this job are on the website until the next app update.", meta };
  }
  // Settled requests and every state the app can't read must not fall through to
  // "out to pros" (review G4a #3): that promise is only true for a pending request.
  if (o.req.status === "cancelled") {
    return { state: "ok", label: "CANCELLED", hero: "This request was cancelled.", sub: "Post a new request whenever you need one.", meta: [] };
  }
  if (o.req.status === "completed") {
    return { state: "ok", label: "ALL DONE", hero: "This one's wrapped up.", sub: "Nothing outstanding. Post another request whenever you need one.", meta: [] };
  }
  if (o.req.status !== "pending") {
    return { state: "wait", label: "ON THE WEBSITE", hero: "Check this request on freddyfixit.ca for now.", sub: "The app can't show this request's stage yet.", meta: [] };
  }
  const meta: { label: string; value: string; accent?: boolean }[] = [{ label: "POSTED", value: o.req.service_needed ?? "Request" }];
  if (o.bids.kind === "ok" && o.bids.value > 0) meta.push({ label: "ESTIMATES", value: String(o.bids.value) });
  return { state: "wait", label: "OUT TO PROS", hero: "Your request is out to local pros.", sub: "Estimates usually land within a day. We'll email you when the first one arrives.", meta };
}

/** The switcher dot for a request: "ok" when settled, else neutral. Orange is the pass's job. */
export function requestDot(r: any): "ok" | "wait" {
  return isPastRequest(r) ? "ok" : "wait";
}
