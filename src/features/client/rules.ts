// Pure derivations for the client home, ported from web ClientDashboard.tsx.
// No React, no I/O: the screen passes in what it read, so the pass, the attention
// card and the tab bar all read ONE answer (web: "one predicate, shared by every
// reader"; the pass and the card must read the same array).
import type { IconName, RowTone, State } from "@/kit";
import { jobIsLive } from "@/lib/jobStage";
import { jobFullyFunded } from "@/lib/jobFunding";
import { addressMissing, estimateJobBalance } from "@/lib/jobRules";
import { contractBlockedBy, contractCheckFailed, type ContractGate, type JobExtras } from "@/features/job/reads";
import { ADDRESS_ANCHOR, CONTRACT_ANCHOR, type JobAnchorId } from "@/features/job/anchors";
import type { ReleaseNote } from "@/features/job/releaseNotes";

// ── Tabs (web visibleNav, ClientDashboard.tsx:116) ─────────────────────────────
// Web shows My Pros only past 3 because up to 3 already render as a strip on its
// home tab. The app's Requests tab has no strip, so the app shows the tab from the
// first pro (PLAN 4.1: "hidden when 0"); with the web threshold, 1-3 pros would be
// unreachable (review G4a round 2). Recurring and History are Account rows.
export function clientNav(o: { pros: number; plans: number; past: number }) {
  return { pros: o.pros > 0, recurring: o.plans > 0, history: o.past > 0 };
}

export const isPastRequest = (r: any) => r?.status === "completed" || r?.status === "cancelled";

/** Web ClientDashboard.tsx:562: the picked request, else the first open one, else the newest. */
export function pickActiveRequest(requests: any[], selectedId: string | null) {
  const open = requests.filter((r) => !isPastRequest(r));
  return (selectedId && requests.find((r) => r.id === selectedId)) || open[0] || requests[0] || null;
}

/** A read the screen made for the active request: we know, we don't know, or not asked yet. */
export type Read<T> = { kind: "loading" } | { kind: "error" } | { kind: "ok"; value: T };

export type JobView = { job: any | null; proName: string | null; extras: JobExtras };

/**
 * A live job the app can't manage yet: milestone (stage) payments are step 4.9, so
 * a milestone job is handed to the website. Every other job has the job screen.
 */
export function jobOnWebOnly(job: any | null): boolean {
  if (!job || !job.is_milestone) return false;
  if (job.status === "completed" || job.payment_status === "released") return false;
  return jobIsLive(job) || job.status === "disputed";
}

// ── "Needs your attention" (web ClientDashboard.tsx:2146) ────────────────────
// ORDER MATTERS: only the first three render (AttentionCard max={3}), so every row
// that gates money is pushed FIRST. Same rows, same order, same words as web; each
// job-stage row routes to the job screen at the control it names (`anchor`).
// Not ported: the chat-time and unread-message rows (chat is step 4.10).
export type AttnRow = {
  key: string; icon: IconName; tone: RowTone;
  hero: string; text: string; cta: string;
  action: "estimates" | "photo" | "settings" | "job";
  /** For action "job": the job and the control to land on. */
  jobId?: string; anchor?: JobAnchorId;
};

/**
 * What is still owed on the job, for the sentence only (web `jobBalance(j)`, now
 * jobRules.estimateJobBalance). null when it can't be stated: an uncharged job whose
 * fee rate couldn't be read. When `total_charged` is set the rate is not consulted,
 * so the 0 passed then is never used. The app never computes a charge: the balance
 * checkout derives its own amount server-side.
 */
export function balanceFigure(job: any, feeRate: number | null, waived: boolean): number | null {
  if (job?.total_charged == null && feeRate == null) return null;
  return estimateJobBalance(job, feeRate ?? 0, waived ? job?.id ?? null : null);
}

export type JobStageInput = {
  job: any;
  gate: ContractGate;
  repostBlock: string | null | undefined;
  releaseNote: ReleaseNote | null;
  feeRate: number | null;
  waived: boolean;
};

/** The job-stage rows, money-gating first. The pass, the Requests card and the job screen's primary button all read this ONE array. */
export function jobStageRows(x: JobStageInput): AttnRow[] {
  const j = x.job;
  if (!j) return [];
  const rows: AttnRow[] = [];
  const go = (key: string, icon: IconName, tone: RowTone, hero: string, text: string, cta: string, anchor: JobAnchorId) =>
    rows.push({ key, icon, tone, hero, text, cta, action: "job", jobId: j.id, anchor });
  const contractBlocked = contractBlockedBy(x.gate);
  // 1. No signed agreement: the client physically can't pay, so the pro is never dispatched.
  //    A check that FAILED adds no row (web `!contractCheckError`); the job screen says "couldn't verify".
  if (contractBlocked && !contractCheckFailed(x.gate) && x.gate.kind === "ok" && jobIsLive(j)
      && j.payment_status !== "held" && j.payment_status !== "released") {
    if (x.gate.status === "sent") go("contract", "file", "accent", "Your service agreement is ready to sign.", "Your pro sent the service agreement — sign it so you can pay and lock in your visit.", "Review & sign", CONTRACT_ANCHOR);
    else go("contract", "file", "accent", "Waiting on your pro's service agreement.", "Waiting on your pro to send the service agreement. You'll be able to pay and book once it's signed by both of you.", "See job", CONTRACT_ANCHOR);
  }
  // 2. The other hard pay-gate, scoped to the DEPOSIT branches exactly like the button it mirrors.
  if (!j.is_milestone && j.amount && ["scheduled", "in_progress", "pending_confirmation"].includes(j.status)
      && !["held", "released"].includes(j.payment_status ?? "unpaid") && addressMissing(j)) {
    go("address", "map-pin", "accent", "We need your full service address.", "Confirm your full service address — it's the last step before your deposit, and your pro can't find you without it.", "Confirm address", ADDRESS_ANCHOR);
  }
  // 3. A release that didn't complete: money taken and not yet reached anybody.
  if (x.releaseNote) {
    go("release", "dollar", "accent", "A payment didn't go through.", x.releaseNote.text, x.releaseNote.kind === "balance" ? "Pay now" : "See job", "confirm");
  }
  // 4. Work finished, only the deposit held: the balance stands between the pro and their money.
  if (j.status === "pending_confirmation" && !j.is_milestone && j.payment_status === "held" && !jobFullyFunded(j)) {
    const owed = balanceFigure(j, x.feeRate, x.waived);
    go("balance", "dollar", "accent", "Your pro finished — the balance is due.",
      "Your pro finished the job — pay the remaining " + (owed != null ? "$" + owed.toFixed(2) : "balance") + " so you can confirm and release their payment.", "Pay balance", "confirm");
  }
  if (j.price_change_pending) go("price", "dollar", "accent", "Your pro proposed a new price.", "Your pro proposed a new price — review and approve or decline.", "Review price", "price");
  if (j.status === "assigned" && j.price_hike_from != null && Number(j.amount ?? 0) > Number(j.price_hike_from) + 0.005) {
    go("hike", "alert-triangle", "warn", "Your pro raised the price after you picked them.", "Your pro raised the price after you picked them — approve it or re-open to other pros.", "Review price", "hike");
  }
  // Only chase the confirmation once the job is paid in full (confirm_job_completion raises otherwise).
  else if (j.status === "pending_confirmation" && !j.is_milestone && jobFullyFunded(j)) {
    go("confirm", "check-circle", "accent", "Your pro says the job is done.", "Your pro marked the job complete — confirm the work to release payment.", "Confirm now", "confirm");
  }
  if (j.status === "assigned" && j.schedule_proposed_at && !j.client_approved_at && !(j.client_rescheduled_at && !j.reschedule_accepted_at)) {
    go("sched", "calendar", "accent", "Your pro proposed a time and price.", "Your pro proposed a time and price — approve it to book the visit.", "Review proposal", "sched");
  }
  if (j.status === "assigned" && j.walkthrough_proposed_at && !j.walkthrough_approved_at) {
    go("walkthrough", "calendar", "accent", "Your pro wants a free walkthrough first.", "Your pro wants to do a free walkthrough before pricing — confirm the visit time.", "Review time", "walkthrough");
  }
  // The server's answer (job_repost_block): null = allowed; undefined (couldn't tell) never offers it.
  if (x.repostBlock === null) {
    go("repost", "refresh", "warn", "Your pro has gone quiet.", "It's been over a week since you chose your pro with no time or price agreed — you can re-post your job to other pros.", "Re-post my job", "repost");
  }
  return rows;
}

export function attentionRows(o: {
  req: any | null;
  job: Read<JobView>;
  bids: Read<number>;
  refError: string;
  releaseNote: ReleaseNote | null;
  feeRate: number | null;
}): AttnRow[] {
  const jv = o.job.kind === "ok" ? o.job.value : null;
  const job = jv?.job ?? null;
  // A milestone job is on the website (4.9): its stage rows aren't ours to state.
  const rows: AttnRow[] = job && jv && !jobOnWebOnly(job)
    ? jobStageRows({ job, gate: jv.extras.gate, repostBlock: jv.extras.repostBlock, releaseNote: o.releaseNote, feeRate: o.feeRate, waived: false })
    : [];
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
  // A milestone job: stage payments are on the website until step 4.9.
  if (jobOnWebOnly(job)) {
    const meta = [...proMeta];
    if (job.amount) meta.push({ label: "AGREED", value: money(job.amount) });
    return { state: "wait", label: "ON THE WEBSITE", hero: "Manage this job's stage payments on freddyfixit.ca for now.", sub: proName + " is on it. Stage payments come to the app in the next update.", meta };
  }
  // A live job whose agreement check FAILED: we can't say "nothing needed" (a failed
  // read is not a signed agreement). Stricter than web, which falls through to BOOKED IN.
  if (job && jobIsLive(job) && jv && jv.extras.gate.kind === "error" && job.payment_status !== "held" && job.payment_status !== "released") {
    return { state: "wait", label: "COULDN'T CHECK", hero: "We couldn't check this job's agreement.", sub: "Pull down to try again.", meta: [...proMeta] };
  }
  // Booked (web branch 4): `scheduled_at`, and formatWhen degrades to "the agreed time".
  if (job && job.scheduled_at) {
    const meta = [...proMeta];
    meta.push({ label: "ARRIVING", value: formatWhen(job.scheduled_at) });
    if (job.amount) meta.push({ label: "AGREED", value: money(job.amount) });
    return { state: "wait", label: "BOOKED IN", hero: proName + " is coming " + formatWhen(job.scheduled_at) + ".", sub: "Nothing needed from you until the work is done.", meta };
  }
  // A pro is picked but nothing is scheduled (web branch 5): the ball is in their court.
  if (job) {
    const meta = [...proMeta];
    if (job.amount) meta.push({ label: "QUOTED", value: money(job.amount) });
    return { state: "wait", label: "WITH YOUR PRO", hero: proName + " is sorting out the details.", sub: "We'll let you know the moment there's something for you to do.", meta };
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
