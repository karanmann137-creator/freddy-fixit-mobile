// Pure derivations for the contractor home, ported from web ContractorDashboard.tsx.
// No React, no I/O: the screen passes in what it read, so the pass, the attention
// card, the switcher dots and the job screen's one orange button all read ONE
// answer (web: "one predicate, shared by every reader").
import type { IconName, RowTone, State } from "@/kit";
import { conversationKey, type Conversation } from "@/lib/chatUnread";
import { jobIsLive } from "@/lib/jobStage";
import { photosMissing } from "@/lib/jobRules";
import { jobAwaitingBalance, jobBalanceDue } from "@/lib/jobFunding";
import { formatWhen } from "@/features/client/rules";
import { whenLong } from "./calendarRules";

// ── Tabs (web visibleNav, ContractorDashboard.tsx:80) ─────────────────────────
// Each optional area appears the moment it has something in it (web: Hick's law).
// On a phone: Jobs / Available / Messages / Earnings / Account are tabs; Reviews
// and Calendar are rows (Account and Jobs), gated by the same counts.
export function contractorNav(o: { scheduled: number; earned: number; reviews: number }) {
  return { calendar: o.scheduled > 0, earnings: o.earned > 0, reviews: o.reviews > 0 };
}

export const navCounts = (d: { jobs: any[]; contractor: any | null; reviews: any[]; reviewsFailed?: boolean }) => ({
  scheduled: d.jobs.filter((j) => !!j.scheduled_at).length,
  earned: Number(d.contractor?.total_earned ?? 0),
  // A failed reviews read keeps the row, so its couldn't-load screen is reachable (review G5 #2).
  reviews: d.reviewsFailed ? Math.max(1, d.reviews.length) : d.reviews.length,
});

// ── Section anchors inside the job screen (web ContractorDashboard.tsx:166) ───
// Bare ids, exactly as web: one job screen is open at a time, so each id is unique
// on it, and the ring compares the id BY STRING (web rule: never key them per job).
export const A_CLAIM = "ffp-claim";
export const A_RESCHED = "ffp-resched";
export const A_WALK = "ffp-walkthrough";
export const A_PROPOSE = "ffp-propose";
export const A_PHOTOS = "ffp-photos";
export const A_ONWAY = "ffp-onway";
export const A_BALANCE = "ffp-balance";
/** web ContractPanel's CONTRACT_ANCHOR: on EVERY render branch, including loading. */
export const CONTRACT_ANCHOR = "ff-contract-panel";
/** App-only: the price-change block, so "Bill for tracked time" can land on the form it opens. */
export const A_PRICE = "ffp-price";

/** The four places an attention row can send the pro (web's onClick bodies). */
export type AttnAction =
  | { kind: "payouts" }                              // web setupPayouts(): website until E2 (PLAN 5.3)
  | { kind: "job"; jobId: string; anchor: string }   // web focusJobAnchor(job, anchor)
  | { kind: "available" }                            // web setActiveTab("available")
  | { kind: "chat"; jobId: string }                  // web: re-open the chat-time prompt / open the conversation
  | { kind: "messages" };                            // a bid thread: the Messages tab

export type AttnRow = {
  key: string; icon: IconName; tone: RowTone;
  hero: string; text: string; cta: string;
  danger?: boolean;
  action: AttnAction;
};

/** web: `disputes` keyed by job, the FIRST row per job of a newest-first read. */
export function disputesByJob(disputes: any[]): Record<string, any> {
  const m: Record<string, any> = {};
  for (const d of disputes) if (d?.job_id && !m[d.job_id]) m[d.job_id] = d;
  return m;
}

/** web ContractorDashboard.tsx:1686: a time the CLIENT named in chat, waiting on this pro. */
export function chatTimeJobs(jobs: any[], meId: string | null, now = Date.now()): any[] {
  return jobs.filter((j) => j.chat_time_at && !j.chat_time_resolved_at && j.chat_time_by && j.chat_time_by !== meId
    && j.status !== "cancelled" && j.status !== "completed"
    && new Date(j.chat_time_at).getTime() > now);
}

/** web MessagesInbox `partyName`. */
export function partyName(c: Conversation): string {
  if (c.other_company || c.other_name) return (c.other_company || c.other_name) as string;
  if (c.kind === "bid") return c.i_am === "client" ? "A contractor who bid" : "A client";
  return c.i_am === "client" ? "Your contractor" : "Your client";
}

const q = (s: string) => "“" + s + "”";

// ── "Needs your attention" (web ContractorDashboard.tsx:1709-1858) ────────────
// ⚠️ ORDER MATTERS, and it is web's order exactly: only the first FOUR render, so
// money-gating rows (payouts, claims, an unpaid balance, unsent agreements,
// missing photos) are pushed FIRST and the conversational rows go last. Inside
// the per-job loop the first seven are an `else if` chain: a new predicate goes
// BEFORE the one it overlaps, never after it. The last three per-job checks are
// independent `if`s (a job can owe a balance AND lack an agreement).
export function contractorAttention(o: {
  jobs: any[];
  contractor: any;
  disputes: Record<string, any>;
  contracts: Record<string, string>;
  contractsFailed: boolean;
  openJobs: any[];
  chatTime: any[];
  inbox: Conversation[];
  now?: number;
}): AttnRow[] {
  const now = o.now ?? Date.now();
  const attn: AttnRow[] = [];

  // Won work with nowhere to be paid: ONE row, before the loop (web :1748).
  const liveWonJobs = o.jobs.filter(jobIsLive);
  const payoutLocked = !o.contractor?.stripe_payouts_enabled && liveWonJobs.length > 0;
  if (payoutLocked) {
    attn.push({
      key: "payout-lock", icon: "alert-triangle", tone: "warn", danger: true,
      hero: "CONNECT YOUR PAYOUTS TO CONTINUE",
      text: liveWonJobs.length === 1
        ? "You won " + q(liveWonJobs[0].request?.service_needed ?? "a job") + ", but your client can't be charged and messaging is locked until you connect a bank account. It takes about two minutes."
        : "You've won " + liveWonJobs.length + " jobs, but your clients can't be charged and messaging is locked until you connect a bank account. It takes about two minutes.",
      cta: "Connect payouts",
      action: { kind: "payouts" },
    });
  }

  for (const job of o.jobs) {
    const d = o.disputes[job.id];
    const svc = job.request?.service_needed ?? "a job";
    const to = (anchor: string): AttnAction => ({ kind: "job", jobId: job.id, anchor });
    if (d && d.status === "open" && !d.contractor_responded_at) {
      attn.push({ key: "claim-" + job.id, icon: "alert-triangle", tone: "warn", danger: true, hero: "A CLAIM NEEDS YOUR REPLY", text: "A client filed a claim on " + q(svc) + " — your payout is paused until you respond.", cta: "Respond now", action: to(A_CLAIM) });
    } else if (job.client_rescheduled_at && !job.reschedule_accepted_at && ["assigned", "scheduled", "in_progress"].includes(job.status)) {
      attn.push({ key: "resched-" + job.id, icon: "calendar", tone: "accent", hero: "YOUR CLIENT MOVED THE TIME", text: (job.client?.first_name || "Your client") + " changed the time on " + q(svc) + ".", cta: "Review new time", action: to(A_RESCHED) });
    } else if (job.status === "assigned" && job.walkthrough_approved_at && !job.walkthrough_done_at) {
      attn.push({ key: "wt-" + job.id, icon: "check-circle", tone: "accent", hero: "MARK THE WALKTHROUGH DONE", text: "Walkthrough confirmed for " + q(svc) + (job.walkthrough_at ? " — " + whenLong(job.walkthrough_at) : "") + ". After the visit, mark it done and send your estimate.", cta: "Mark walkthrough done", action: to(A_WALK) });
    } else if (job.status === "assigned" && job.walkthrough_done_at && !job.schedule_proposed_at) {
      attn.push({ key: "wtdone-" + job.id, icon: "dollar", tone: "accent", hero: "SEND YOUR ESTIMATE", text: "You finished the walkthrough on " + q(svc) + " — the client is waiting for your estimate.", cta: "Send estimate", action: to(A_PROPOSE) });
    } else if (job.status === "assigned" && job.slot_released_at && !job.schedule_proposed_at) {
      attn.push({ key: "slot-" + job.id, icon: "calendar", tone: "warn", hero: "PROPOSE A NEW TIME", text: "The booked time on " + q(svc) + " was released — it wasn't signed and paid in time. You still have the job; propose a new time.", cta: "Propose new time", action: to(A_PROPOSE) });
    } else if (job.status === "assigned" && !job.schedule_proposed_at && !job.walkthrough_proposed_at) {
      attn.push({ key: "propose-" + job.id, icon: "dollar", tone: "accent", hero: "SEND YOUR TIME AND PRICE", text: q(svc) + " is waiting for your time and price.", cta: "Propose now", action: to(A_PROPOSE) });
    } else if (job.status === "scheduled" && job.scheduled_at) {
      const dt = new Date(job.scheduled_at).getTime() - now;
      if (dt > 0 && dt < 24 * 3600 * 1000) attn.push({ key: "soon-" + job.id, icon: "calendar", tone: "accent", hero: "YOU'RE ON SITE SOON", text: q(svc) + " is booked for " + whenLong(job.scheduled_at) + ".", cta: "Get ready", action: to(A_ONWAY) });
    }
    // Work is done and only the deposit is in (web :1795).
    if (job.status === "pending_confirmation" && jobAwaitingBalance(job)) {
      attn.push({ key: "bal-" + job.id, icon: "dollar", tone: "accent", hero: "THE BALANCE ISN'T IN YET", text: q(svc) + " is finished but the client still owes $" + jobBalanceDue(job).toFixed(2) + " — your payout is released once they pay and confirm.", cta: "See what's owed", action: to(A_BALANCE) });
    }
    // No signed agreement = the client cannot pay. Only when it's the pro's move,
    // never off a failed read, and not while payouts are off (web :1806).
    if (!o.contractsFailed && !payoutLocked && jobIsLive(job) && !["signed", "sent"].includes(o.contracts[job.id] ?? "")) {
      attn.push({ key: "contract-" + job.id, icon: "file", tone: "accent", hero: "SEND THE AGREEMENT", text: q(svc) + " needs a signed service agreement — your client can't pay until you send it.", cta: "Send agreement", action: to(CONTRACT_ANCHOR) });
    }
    // Photos unlock payment, so chase them once work is under way (web :1811).
    if (job.status === "in_progress" || (job.status === "scheduled" && job.on_my_way_at)) {
      const miss = photosMissing(job);
      if (miss.length) attn.push({ key: "photo-" + job.id, icon: "camera", tone: "warn", hero: "ADD THE REQUIRED PHOTOS", text: q(svc) + " still needs " + miss.join(" and ") + " — you can't mark it complete without them.", cta: "Add photos", action: to(A_PHOTOS) });
    }
  }
  const reserved = o.openJobs.filter((r: any) => r.is_preferred);
  if (reserved.length > 0) {
    attn.push({ key: "reserved", icon: "user-check", tone: "accent", hero: "A CLIENT ASKED FOR YOU", text: reserved.length === 1 ? "A client requested you — " + q(reserved[0].service_needed) + " is reserved for you for 48h." : reserved.length + " clients requested you — jobs are reserved for you for 48h.", cta: "See jobs", action: { kind: "available" } });
  }
  // ── Conversational rows last ──
  for (const job of o.chatTime) {
    attn.push({
      key: "chattime-" + job.id, icon: "clock", tone: "neutral", hero: "A TIME WAS SUGGESTED",
      text: (job.client?.first_name || "Your client") + " suggested " + formatWhen(job.chat_time_at) + " for " + q(job.request?.service_needed ?? "a job") + ".",
      cta: "Accept or change", action: { kind: "chat", jobId: job.id },
    });
  }
  // Unread messages, capped at 3 so a chatty week can't bury the money rows.
  for (const c of o.inbox.filter((x) => x.unread > 0).slice(0, 3)) {
    attn.push({
      key: "msg-" + conversationKey(c), // web: "msg-job:<id>", so a message never turns a switcher dot orange
      icon: "message-square", tone: "neutral",
      hero: c.unread === 1 ? "YOU HAVE AN UNREAD MESSAGE" : "YOU HAVE UNREAD MESSAGES",
      text: partyName(c) + " sent you " + (c.unread === 1 ? "a message" : c.unread + " messages")
        + (c.kind === "bid" ? " about " + q(c.service_needed ?? "a job") + " — they haven't picked anyone yet." : " about " + q(c.service_needed ?? "a job") + "."),
      cta: "Read it",
      action: c.kind === "bid" ? { kind: "messages" } : { kind: "chat", jobId: c.job_id },
    });
  }
  return attn;
}

/** web's JobSwitcher dot: `turn` when a row belongs to this job (keys end "-<job id>"). */
export const jobHasRow = (rows: AttnRow[], jobId: string) => rows.some((a) => a.key.endsWith("-" + jobId));

/** The section that gets this job's single orange button: the first row that names this job. */
export function primaryAnchor(rows: AttnRow[], jobId: string): string | null {
  const r = rows.find((a) => a.action.kind === "job" && a.action.jobId === jobId);
  return r && r.action.kind === "job" ? r.action.anchor : null;
}

export const liveJobsOf = (jobs: any[]) => jobs.filter((j) => !["cancelled", "completed"].includes(j.status));

// ── The pass (web ContractorDashboard.tsx:1860) ──────────────────────────────
// Branch order is severity: an attention row, account not active, payouts not
// connected, the next booked job, live jobs, nothing.
export type PassView = { state: State; label: string; hero: string; sub?: string; meta: { label: string; value: string; accent?: boolean }[] };

export function contractorPass(o: { rows: AttnRow[]; jobs: any[]; contractor: any; openJobs: any[]; earn: any | null; earnFailed: boolean; now?: number }): PassView {
  const now = o.now ?? Date.now();
  const nextBooked = o.jobs
    .filter((j) => j.scheduled_at && new Date(j.scheduled_at).getTime() > now && !["cancelled", "completed"].includes(j.status))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] ?? null;
  const live = liveJobsOf(o.jobs);
  const meta = [
    { label: "Active jobs", value: String(live.length) },
    { label: "Open near you", value: String(o.openJobs.length), accent: o.openJobs.length > 0 },
    // A failed earnings read is "—", never a confident $0.
    { label: "This week", value: o.earnFailed ? "—" : "$" + Number(o.earn?.this_week ?? 0).toFixed(0) },
  ];
  if (o.rows.length > 0) {
    const extra = o.rows.length - 1;
    return { state: "turn", label: "YOUR TURN", hero: o.rows[0].hero, sub: extra > 0 ? extra + " more thing" + (extra === 1 ? "" : "s") + " needs you below." : o.rows[0].text, meta };
  }
  const c = o.contractor;
  if (c?.status === "pending") return { state: "wait", label: "UNDER REVIEW", hero: "WE'RE CHECKING YOUR PROFILE", sub: "We'll email you the moment you're approved — nothing else is needed from you.", meta: [] };
  if (c?.status !== "active") return { state: "wait", label: "ACCOUNT INACTIVE", hero: "YOUR ACCOUNT ISN'T ACTIVE", sub: "Get in touch and we'll sort it out.", meta: [] };
  if (!c?.stripe_payouts_enabled) return { state: "turn", label: "ONE STEP LEFT", hero: "CONNECT YOUR PAYOUTS", sub: "Until a bank account is connected we can't pay you — and clients can't be charged for your jobs.", meta };
  if (nextBooked) {
    return { state: "wait", label: "NEXT UP", hero: formatWhen(nextBooked.scheduled_at).toUpperCase(), sub: (nextBooked.request?.service_needed ?? "A job") + (nextBooked.client?.first_name ? " for " + nextBooked.client.first_name : ""), meta };
  }
  if (live.length > 0) return { state: "ok", label: "ALL CAUGHT UP", hero: "NOTHING NEEDS YOU", sub: live.length + " job" + (live.length === 1 ? "" : "s") + " on the go — we'll tell you the moment one needs a move.", meta };
  return {
    state: "ok", label: "NOTHING ON THE GO", hero: "READY FOR WORK",
    sub: o.openJobs.length > 0 ? o.openJobs.length + " job" + (o.openJobs.length === 1 ? "" : "s") + " posted near you right now." : "We'll notify you the moment a job lands in your trades.",
    meta,
  };
}

const STATUS: Record<string, string> = {
  assigned: "Picked: send time and price", scheduled: "Booked", in_progress: "In progress",
  pending_confirmation: "Waiting on the client", completed: "Done", cancelled: "Cancelled", disputed: "Claim open",
};
export const jobStatusLabel = (j: any) => STATUS[j?.status] ?? String(j?.status ?? "—");

/**
 * web `jobDestination` (ContractorDashboard.tsx:120): the street address once the
 * client confirmed it at deposit time, else the approximate area. `exact` is what
 * the wording keys on: never label an approximate area as an address.
 */
export const jobDestination = (j: any): { text: string; exact: boolean } => {
  const exact = String(j?.service_address || "").trim();
  if (exact) return { text: exact, exact: true };
  return { text: String(j?.request?.location || "").trim(), exact: false };
};

export const mapsUrl = (addr: string) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr);
