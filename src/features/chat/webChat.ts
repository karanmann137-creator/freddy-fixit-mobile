// ⚠️ PORTED FROM WEB COMPONENT FILES, not from src/lib. Web prerequisite (same
// shape as PLAN W5): move each item below into a web src/lib module (e.g.
// src/lib/chatRules.ts), add it to the SHARED list, `npm run sync`, then delete
// this file and import the synced copy. Until then every line is a faithful copy
// of the web source named beside it. Change nothing here that isn't changed on
// web first.
//
//   BUCKET, IMAGE_TYPES, VIDEO_TYPES, MAX_IMAGE, MAX_VIDEO   components/JobChat.tsx:20
//   STATUS_LABEL                                               components/JobChat.tsx:29
//   jobEvents                                                  components/JobChat.tsx:43
//   CANNED                                                     components/JobChat.tsx:79
//   BID_COLS, BID_IMAGE_EXTS                                   components/BidChat.tsx:45, :150
//   partyName, initials                                        components/MessagesInbox.tsx:23
//   chatTimePending   pages/ClientDashboard.tsx:2067 + pages/ContractorDashboard.tsx:1686
//                     (the same predicate, written inline twice on web)
//   COPY              the user-facing sentences of JobChat / BidChat / ChatTimePrompt
import type { IconName } from "@/kit";
import type { Conversation } from "@/lib/chatUnread";
import { formatWhen } from "@/lib/chatParse";

export const BUCKET = "message-media";
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const MAX_IMAGE = 10 * 1024 * 1024; // 10 MB
export const MAX_VIDEO = 50 * 1024 * 1024; // 50 MB
/** BidChat's HEIC fallback: an iPhone photo can arrive with an empty type. */
export const BID_IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"];

export const BID_COLS = "id, request_id, thread_contractor_id, sender_id, content, created_at, attachment_path, attachment_type, blocked, flag_reasons";

export type ChatRole = "client" | "contractor";

export const STATUS_LABEL: Record<string, string> = {
  assigned: "Assigned",
  scheduled: "Scheduled",
  in_progress: "In progress",
  pending_confirmation: "Waiting on the client",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Claim open",
};

/**
 * The job's own timeline, read straight off the row's timestamps and folded into
 * the conversation. Nothing here writes: pure derivation, so it can never
 * disagree with the dashboard or break a flow.
 */
export type ChatEvent = { at: string; text: string; icon: IconName };
export function jobEvents(job: any, role: ChatRole): ChatEvent[] {
  if (!job) return [];
  const pro = role === "contractor";
  const out: ChatEvent[] = [];
  // `text` may be a thunk so a row's own fields are only touched when the timestamp
  // that gates the event is present (web: formatWhen(null) once threw here).
  const add = (at: any, text: string | (() => string), icon: IconName) => {
    if (!at) return;
    out.push({ at: String(at), text: typeof text === "function" ? text() : text, icon });
  };
  add(job.walkthrough_approved_at, () => "Walkthrough booked for " + formatWhen(job.walkthrough_at), "calendar");
  add(job.walkthrough_done_at, "Walkthrough done", "check-circle");
  add(job.schedule_proposed_at, pro ? "You sent an estimate" : "Estimate received", "dollar");
  add(job.client_approved_at, pro ? "Client approved the estimate" : "You approved the estimate", "check-circle");
  add(job.paid_at, pro ? "Client paid — the money is held safely" : "You paid — the money is held safely", "dollar");
  add(job.client_rescheduled_at, pro ? "Client asked for a different time" : "You asked for a different time", "calendar");
  add(job.reschedule_accepted_at, pro ? "You accepted the new time" : "Your pro accepted the new time", "check-circle");
  add(job.client_confirmed_visit_at, pro ? "Client confirmed the visit" : "You confirmed the visit", "check");
  add(job.on_my_way_at, pro ? "You marked yourself on the way" : "Your pro is on the way", "car");
  add(job.before_photo_at, "Before photo added", "camera");
  add(job.after_photo_at, "Finished-work photo added", "camera");
  add(job.contractor_completed_at, pro ? "You marked the work complete" : "Your pro marked the work complete", "check-circle");
  add(job.client_confirmed_at, pro ? "Client confirmed the work" : "You confirmed the work", "check-circle");
  add(job.released_at, pro ? "Payment released to you" : "Payment released to your pro", "dollar");
  add(job.disputed_at, "A claim was opened on this job", "alert-triangle");
  return out;
}

// Fill-the-box replies: deliberately NOT send-on-tap, so a pro can adjust the
// wording first. Nothing here promises a time or a price.
export const CANNED: string[] = [
  "On my way — see you shortly.",
  "Running about 15 minutes behind, sorry about that.",
  "Could you send a photo of the area so I can come prepared?",
  "I've uploaded photos of the work — take a look when you get a chance.",
];

/** "Sam R." / a company name / a sensible fallback: never a blank row. */
export function partyName(c: Conversation): string {
  if (c.other_company || c.other_name) return (c.other_company || c.other_name) as string;
  // Nobody is hired at bid stage, so "Your contractor" would be a small lie.
  if (c.kind === "bid") return c.i_am === "client" ? "A contractor who bid" : "A client";
  return c.i_am === "client" ? "Your contractor" : "Your client";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * A time the OTHER person named in the chat, waiting on this person to accept or
 * counter. `chat_time_by` is whoever typed it, so this never prompts the person
 * who suggested it.
 */
export function chatTimePending(job: any, meId: string | null | undefined): boolean {
  return !!(job
    && job.chat_time_at
    && !job.chat_time_resolved_at
    && job.chat_time_by
    && job.chat_time_by !== meId
    && job.status !== "cancelled"
    && job.status !== "completed"
    && new Date(job.chat_time_at).getTime() > Date.now());
}

export const COPY = {
  // JobChat
  jobTypes: "Only images (JPG, PNG, WebP, GIF, HEIC) or videos (MP4, WebM, MOV) can be sent.",
  jobImageBig: "That image is over 10 MB. Please send a smaller one.",
  jobVideoBig: "That video is over 50 MB. Please send a shorter or smaller clip.",
  jobUploadFailed: "Upload failed — please try again.",
  jobSendFailed: "Could not send — please try again.",
  jobEmpty: "No messages yet. Say hello 👋",
  jobClosedDefault: "This job is finished, so messaging is closed.",
  jobLockedDefault: "This conversation is locked.",
  // BidChat
  bidTypes: "Only photos can be sent here — JPG, PNG, WebP, GIF or HEIC.",
  bidImageBig: "That photo is over 10 MB. Please send a smaller one.",
  bidUploadFailedPro: "Couldn't attach that photo. You can only send here once the client has messaged you.",
  bidUploadFailed: "Couldn't attach that photo — please try again.",
  bidSendFailedPro: "Couldn't send. You can only reply here once the client has messaged you.",
  bidSendFailed: "Couldn't send your message — please try again.",
  bidLoadFailed: "We couldn't load this conversation. Check your connection and try again.",
  bidEmptyClient: "Ask anything before you decide — what's included, how long it'll take, when they could start. You can send a photo too, which usually gets you a firmer number.",
  bidEmptyPro: "The client hasn't messaged you yet. You'll be able to reply here as soon as they do.",
  bidFooter: "Keep it on Freddy Fix It — phone numbers, emails and off-platform payment are blocked, and only messages here are covered if something goes wrong.",
  onlyYou: "Only you can see this message.",
} as const;
