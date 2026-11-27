// JobChat (PLAN step 4.10): port of web components/JobChat.tsx for one job's
// client <-> contractor conversation. Shared by both roles; the route decides the
// role through the area's ChatInboxProvider.
//
// What carries over unchanged from web:
//   · Realtime: one channel per open thread on messages INSERT for this job. Here it
//     lives while the screen is FOCUSED (a chat pushed under another screen is not
//     being read) and is removed on blur and unmount.
//   · Opening the thread IS reading it: mark_job_read, then CHAT_CHANGED_EVENT over
//     the bus, so the inbox and the tab badge re-read.
//   · The chat guard: a blocked row still inserts (the admin's copy) but RLS hides it
//     from the other side. We select the row back, and a blocked one keeps the text
//     in the box with the server's reason, and shows struck through in the list.
//   · chatReadOnly(job) is the one rule for "can I still write", checked in send()
//     as well as by not rendering the composer (web 2026-11-03).
//   · Schedule from chat: detectDateTime → chat_propose_time, fire-and-forget.
//   · Media: compress → upload → scan (images) → insert, through platform/upload.ts.
// Different on purpose: a failed messages read says so with a retry (web drops the
// error and would show "No messages yet"); the job row is read here rather than
// passed in, so the read-only rule always sees a real row.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, FlatList, ScrollView, View, TextInput } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { ImagePickerAsset } from "expo-image-picker";
import { BottomSheet, Button, Card, DeadEnd, Ic, Pill, Row, Screen, ScreenHeader, SkRow, Txt, notify, rgba, ui, useDelayed, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { blockedReason, BLOCKED_HELP, detectDateTime, formatWhen } from "@/lib/chatParse";
import { announceChatChange, chatClosedReason, chatReadOnly, CHAT_AS_CLIENT, daySeparator, isNewDay, messageTime } from "@/lib/chatUnread";
import { jobIsLive } from "@/lib/jobStage";
import { jobCode } from "@/lib/jobCode";
import { uploadImage } from "@/platform/upload";
import { openOnWeb } from "@/features/client/web";
import { useChatInbox } from "./inbox";
import { ChatTimePrompt } from "./ChatTimePrompt";
import { AttachSheet, Bubble, ChatChip, ComposerNote, ComposerRow, DaySep, EventLine, PendingPreview, extOfAsset, nextTopic, toUploadAsset, useBottomPad, useSignedUrls, type Msg, type Pending } from "./parts";
import { BID_IMAGE_EXTS, BUCKET, CANNED, COPY, IMAGE_TYPES, MAX_IMAGE, MAX_VIDEO, STATUS_LABEL, VIDEO_TYPES, chatTimePending, jobEvents, type ChatEvent } from "./webChat";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOB_SELECT = "*, request:client_requests!jobs_request_id_fkey(service_needed, location)";

type JobLoad = { kind: "loading" } | { kind: "error" } | { kind: "gone" } | { kind: "ok"; job: any };
type Item = { key: string; at: string; sep: string | null; msg?: Msg; evt?: ChatEvent };

export function JobChatScreen({ jobId }: { jobId: string }) {
  const { t } = useTheme();
  const inbox = useChatInbox();
  const { role, me, markJob, reloadMe } = inbox;
  const meId = me.kind === "ok" ? me.id : null;
  const validId = UUID.test(jobId);
  const showSkeleton = useDelayed();

  const [jobLoad, setJobLoad] = useState<JobLoad>({ kind: "loading" });
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [msgsFailed, setMsgsFailed] = useState(false);
  const { urls, sign } = useSignedUrls();
  const seq = useRef(0);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [cannedOpen, setCannedOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const inputRef = useRef<React.ComponentRef<typeof TextInput> | null>(null);
  const listRef = useRef<FlatList<Item> | null>(null);
  const bottomPad = useBottomPad();

  /** Read the job and its messages. A failed read keeps whatever was already on screen. */
  const load = useCallback(async () => {
    if (!validId) return;
    const mine = ++seq.current;
    let jobRow: any = null, jobFailed = false, rows: Msg[] | null = null;
    try {
      const [j, m] = await Promise.all([
        supabase.from("jobs").select(JOB_SELECT).eq("id", jobId).maybeSingle(),
        supabase.from("messages").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
      ]);
      jobFailed = !!j.error;
      jobRow = j.data;
      rows = m.error ? null : ((m.data ?? []) as Msg[]);
    } catch {
      jobFailed = true;
    }
    if (mine !== seq.current) return;
    // A failed job read keeps a job already on screen; only a SUCCESSFUL empty read is "gone".
    setJobLoad((prev) => (jobFailed ? (prev.kind === "ok" ? prev : { kind: "error" }) : jobRow ? { kind: "ok", job: jobRow } : { kind: "gone" }));
    if (!rows) { setMsgsFailed(true); return; }
    setMsgsFailed(false);
    setMsgs(rows);
    void sign(rows);
  }, [jobId, validId, sign]);

  // Live while focused. Subscribe, catch up on anything missed while away, mark read.
  useFocusEffect(useCallback(() => {
    if (!validId || !meId) return;
    void load();
    markJob(jobId);
    const channel = supabase.channel("jobchat:" + jobId + ":" + nextTopic())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `job_id=eq.${jobId}` }, (payload) => {
        const m = payload.new as Msg;
        setMsgs((prev) => (prev?.some((x) => x.id === m.id) ? prev : [...(prev ?? []), m]));
        if (m.attachment_path) void sign([m]);
        // It arrived while they were looking at it, so it's already read. Not while
        // the app is in the background: nobody is looking then.
        if (m.sender_id !== meId && AppState.currentState === "active") markJob(jobId);
      })
      .subscribe();
    const app = AppState.addEventListener("change", (s) => { if (s === "active") { void load(); markJob(jobId); } });
    return () => {
      app.remove();
      void supabase.removeChannel(channel);
    };
  }, [validId, meId, jobId, load, markJob, sign]));

  const job = jobLoad.kind === "ok" ? jobLoad.job : null;
  const ctx = role === "contractor" ? { viewer: "contractor" as const, payoutsEnabled: inbox.payoutsEnabled } : CHAT_AS_CLIENT;
  const readOnly = chatReadOnly(job, ctx);
  const closedReason = chatClosedReason(job, ctx);
  // Only the payout lock is clearable from inside the chat, and only while it is the
  // reason. Payout setup is on the website until step 5.3 (web change E2).
  const closedAction = role === "contractor" && inbox.payoutsEnabled === false && jobIsLive(job)
    ? { label: "Connect payouts on the website", onPress: () => openOnWeb("/contractor-dashboard") } : null;

  const items: Item[] = React.useMemo(() => {
    const merged: { at: string; msg?: Msg; evt?: ChatEvent }[] = [
      ...(msgs ?? []).map((m) => ({ at: m.created_at ?? "", msg: m })),
      ...jobEvents(job, role).map((e) => ({ at: e.at, evt: e })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return merged.map((it, i) => ({
      ...it,
      key: it.msg ? it.msg.id : "e-" + it.at + "-" + it.evt?.text,
      sep: isNewDay(it.at, i > 0 ? merged[i - 1].at : null) ? daySeparator(it.at) : null,
    }));
  }, [msgs, job, role]);

  useEffect(() => {
    const id = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [items.length, pending]);

  if (!validId) {
    return <DeadEnd retry={false} msg="This conversation link isn't right." alt={<Button onPress={() => router.navigate(role === "client" ? "/client/messages" : "/contractor/messages")}>Go to Messages</Button>} />;
  }
  if (me.kind === "error") return <DeadEnd msg="We couldn't load your account. Check your connection, then try again." onRetry={() => void reloadMe()} />;
  if (jobLoad.kind === "error") return <DeadEnd msg="We couldn't load this conversation. Check your connection, then try again." onRetry={() => void load()} />;
  if (jobLoad.kind === "gone") {
    return <DeadEnd retry={false} msg="This conversation isn't available to you." alt={<Button onPress={() => router.navigate(role === "client" ? "/client/messages" : "/contractor/messages")}>Go to Messages</Button>} />;
  }

  const conv = inbox.convByJob[jobId];
  const otherFirst = (conv?.other_name ?? "").trim().split(/\s+/)[0];
  const title = "Chat with " + (otherFirst || (role === "client" ? "your contractor" : "your client"));

  /* ── composer actions (web JobChat) ───────────────────────────────────── */

  const pickAsset = (a: ImagePickerAsset) => {
    setErr("");
    const mime = (a.mimeType || "").toLowerCase();
    const ext = extOfAsset(a);
    const kind: Pending["kind"] = a.type === "video" || mime.startsWith("video/") ? "video" : "image";
    // An iPhone photo can arrive with an empty type: fall back to the extension.
    const ok = kind === "video"
      ? (mime ? VIDEO_TYPES.includes(mime) : ["mp4", "mov", "webm"].includes(ext))
      : (mime ? IMAGE_TYPES.includes(mime) : BID_IMAGE_EXTS.includes(ext));
    if (!ok) { setErr(COPY.jobTypes); return; }
    const size = typeof a.fileSize === "number" ? a.fileSize : 0;
    if (kind === "image" && size > MAX_IMAGE) { setErr(COPY.jobImageBig); return; }
    if (kind === "video" && size > MAX_VIDEO) { setErr(COPY.jobVideoBig); return; }
    setPending({ asset: toUploadAsset(a), kind });
  };

  /** Drop text into the composer rather than sending it, so it can be edited. */
  const fillInput = (text: string) => {
    setInput((prev) => (prev.trim() ? prev.trimEnd() + " " + text : text));
    setCannedOpen(false);
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const send = async () => {
    const content = input.trim();
    if (sending || !meId) return;
    // The lock is a property of the rule, not of the layout: guard the one function
    // that writes a message, not only the rendering of the composer.
    if (readOnly) return;
    if (!content && !pending) return;
    setSending(true);
    setErr("");
    setNotice("");
    let attachment_path: string | null = null;
    let attachment_type: string | null = null;
    try {
      if (pending) {
        // Compress first (videos come back untouched), upload, then the safety scan
        // BETWEEN the upload and the insert, so a refused photo is never attached to
        // a message anyone else can read. Images only: the scanner can't see a video.
        const up = await uploadImage({ bucket: BUCKET, basePath: `${jobId}/${meId}-${Date.now()}`, asset: pending.asset, profile: "photo", scan: pending.kind === "image" });
        if (!up.ok) { setErr(up.blocked ? up.message : COPY.jobUploadFailed); return; }
        attachment_path = up.path;
        attachment_type = pending.kind;
      }
      // Select the row back to see what the messages_chat_guard trigger decided.
      const { data: row, error } = await supabase.from("messages")
        .insert({ job_id: jobId, sender_id: meId, content, attachment_path, attachment_type })
        .select("*").maybeSingle();
      if (error) { setErr(COPY.jobSendFailed); return; }
      setPending(null);
      if (!row) {
        // Inserted, but the row didn't come back: re-read, so a blocked one still
        // shows (struck through, with its reason) rather than vanishing.
        setInput("");
        void load();
        announceChatChange();
        return;
      }
      const saved = row as Msg;
      setMsgs((prev) => (prev?.some((x) => x.id === saved.id) ? prev : [...(prev ?? []), saved]));
      if (saved.attachment_path) void sign([saved]);
      if (saved.blocked) {
        // Leave the text in the box so they can edit it out and resend.
        setErr(blockedReason(saved.flag_reasons) + " " + BLOCKED_HELP);
        return;
      }
      setInput("");
      announceChatChange();
      // A concrete day + time becomes an appointment the other side can accept in one
      // tap. Fire-and-forget: a scheduling hiccup must never make a sent message look failed.
      const parsed = detectDateTime(content);
      if (parsed) {
        supabase.rpc("chat_propose_time", { p_job_id: jobId, p_at: parsed.at.toISOString(), p_snippet: content.slice(0, 200) })
          .then(({ data }) => { if (data === "proposed") setNotice("Asked them to confirm " + formatWhen(parsed.at) + "."); }, () => { /* fire-and-forget, as web */ });
      }
    } finally {
      setSending(false);
    }
  };

  /** One-tap actions only. Anything that moves money or closes a job stays on the job screen. */
  const runAction = async (rpc: "contractor_on_my_way" | "confirm_visit", patch: Record<string, any>, ok: string) => {
    if (acting) return;
    setActing(true);
    setErr("");
    const { error } = await supabase.rpc(rpc, { p_job_id: jobId });
    setActing(false);
    if (error) { setErr("Couldn't do that: " + error.message); return; }
    setJobLoad((s) => (s.kind === "ok" ? { kind: "ok", job: { ...s.job, ...patch } } : s));
    void reloadMe();
    setNotice(ok);
  };

  const onTimeResolved = (outcome: string) => {
    const now = new Date().toISOString();
    if (outcome === "declined") {
      setJobLoad((s) => (s.kind === "ok" ? { kind: "ok", job: { ...s.job, chat_time_resolved_at: now } } : s));
      return;
    }
    setJobLoad((s) => (s.kind === "ok" ? { kind: "ok", job: {
      ...s.job,
      chat_time_resolved_at: now,
      ...(outcome === "scheduled" || outcome === "penciled" || outcome === "proposal_updated" ? { scheduled_at: s.job.chat_time_at } : {}),
      ...(outcome === "scheduled" ? { status: "scheduled" } : {}),
    } } : s));
    void reloadMe();
    if (outcome === "ignored") notify("Nothing to update on that job.", "danger");
    else notify(role === "client" ? "Time saved — your pro has been told." : "Time saved — it's on your calendar.");
  };

  const canAct = !readOnly;
  const showOnMyWay = canAct && role === "contractor" && job?.status === "scheduled" && !job?.on_my_way_at;
  const showConfirmTime = canAct && role === "client" && job?.status === "scheduled" && !!job?.scheduled_at && !job?.client_confirmed_visit_at;
  const canSend = (!!input.trim() || !!pending) && !sending;
  const timePending = chatTimePending(job, meId);
  const service = job?.request?.service_needed || job?.service_needed || "Job";
  const location = job?.request?.location || job?.location;
  const loadingFirst = jobLoad.kind === "loading" || msgs === null;

  return (
    <Screen scroll={false} contentStyle={{ paddingHorizontal: 0, paddingBottom: 0 }}>
      <View style={{ paddingHorizontal: t.s4 }}>
        <ScreenHeader title={title} />
        <Txt size={0.75} color={rgba(t.muted, 0.6)} numberOfLines={1}>{service} · {jobCode(jobId)}</Txt>
        {job ? (
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: t.s2, marginTop: t.s2 }}>
            {job.status ? <Pill>{STATUS_LABEL[job.status] ?? job.status}</Pill> : null}
            {job.scheduled_at ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: t.s1 }}>
                <Ic name="calendar" size={ui.icon.xs} color={rgba(t.muted, 0.75)} />
                <Txt size={0.75} color={rgba(t.muted, 0.75)}>{formatWhen(job.scheduled_at)}</Txt>
              </View>
            ) : null}
            {location ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: t.s1, flexShrink: 1, minWidth: 0 }}>
                <Ic name="map-pin" size={ui.icon.xs} color={rgba(t.muted, 0.75)} />
                <Txt size={0.75} color={rgba(t.muted, 0.75)} numberOfLines={1} style={{ flexShrink: 1 }}>{location}</Txt>
              </View>
            ) : null}
            <View style={{ marginLeft: "auto" }}>
              {/* The job lives on the role's home tab until the job screens (4.7 / 5.7) land. */}
              <ChatChip label="Open the job" onPress={() => router.navigate(role === "client" ? "/client" : "/contractor")} />
            </View>
          </View>
        ) : null}
        {timePending ? (
          <View style={{ marginTop: t.s3 }}>
            <Card>
              <Row icon="clock" tone="accent" title={"A time was suggested: " + formatWhen(job.chat_time_at)} sub="Accept or change" chevron onPress={() => setPromptOpen(true)} />
            </Card>
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1, marginTop: t.s3, borderTopWidth: t.hairW, borderTopColor: t.hair }}>
        {loadingFirst && !msgsFailed ? (
          showSkeleton ? <View style={{ padding: t.s4, gap: t.s4 }} accessibilityLabel="Loading this conversation"><SkRow /><SkRow /><SkRow /></View> : null
        ) : msgsFailed && !msgs?.length ? (
          <View style={{ padding: t.s6, alignItems: "center", gap: t.s4 }}>
            <Txt color={t.warn} style={{ textAlign: "center" }}>{COPY.bidLoadFailed}</Txt>
            <Button onPress={() => void load()}>Try again</Button>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(it) => it.key}
            contentContainerStyle={{ padding: t.s4, gap: t.s1, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListHeaderComponent={msgsFailed ? (
              <Txt size={0.78} color={t.warn} style={{ textAlign: "center", marginBottom: t.s2 }} onPress={() => void load()}>
                Couldn&apos;t refresh this conversation. Tap to try again.
              </Txt>
            ) : undefined}
            ListEmptyComponent={<Txt size={0.85} color={rgba(t.muted, 0.45)} style={{ textAlign: "center", marginTop: t.s8 }}>{COPY.jobEmpty}</Txt>}
            renderItem={({ item }) => (
              <View>
                {item.sep ? <DaySep label={item.sep} /> : null}
                {item.evt
                  ? <EventLine icon={item.evt.icon} text={item.evt.text} time={messageTime(item.evt.at)} />
                  : <Bubble m={item.msg!} mine={item.msg!.sender_id === meId} url={item.msg!.attachment_path ? urls[item.msg!.attachment_path] : undefined} />}
              </View>
            )}
          />
        )}
      </View>

      {/* Input, or why there isn't one. */}
      {readOnly && closedAction ? (
        <View style={{ paddingHorizontal: t.s4, paddingTop: t.s4, paddingBottom: bottomPad, borderTopWidth: ui.line, borderTopColor: rgba(t.accentRgb, 0.45), backgroundColor: rgba(t.accentRgb, 0.12) }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.s2, marginBottom: t.s1 }}>
            <Ic name="alert-triangle" size={ui.icon.md} color={t.accent500} />
            <Txt variant="label" size={1.05} color={t.accent500}>MESSAGING IS LOCKED</Txt>
          </View>
          <Txt size={0.85} lh={1.55} style={{ marginBottom: t.s3 }}>{closedReason ?? COPY.jobLockedDefault}</Txt>
          <Button variant="primary" full onPress={closedAction.onPress}>{closedAction.label}</Button>
        </View>
      ) : readOnly ? (
        <View style={{ paddingHorizontal: t.s5, paddingTop: t.s4, paddingBottom: bottomPad, borderTopWidth: t.hairW, borderTopColor: t.hair }}>
          <Txt size={0.82} color={rgba(t.muted, 0.6)} style={{ textAlign: "center" }}>{jobLoad.kind === "ok" ? (closedReason ?? COPY.jobClosedDefault) : " "}</Txt>
        </View>
      ) : (
        <View style={{ borderTopWidth: t.hairW, borderTopColor: t.hair }}>
          {err ? <ComposerNote tone="danger">{err}</ComposerNote> : null}
          {notice ? <ComposerNote tone="good">{notice}</ComposerNote> : null}
          {/* Safe quick actions. Nothing here moves money or closes a job. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: t.s2, paddingHorizontal: t.s4, paddingTop: t.s3 }}>
            <ChatChip label="Suggest a time" icon="calendar" hot={timeOpen} onPress={() => { setTimeOpen(true); setCannedOpen(false); }} />
            {showOnMyWay ? (
              <ChatChip label="I'm on my way" icon="car" hot disabled={acting}
                onPress={() => void runAction("contractor_on_my_way", { on_my_way_at: new Date().toISOString() }, "We let the client know you're on your way.")} />
            ) : null}
            {showConfirmTime ? (
              <ChatChip label="Confirm this time" icon="check" hot disabled={acting}
                onPress={() => void runAction("confirm_visit", { client_confirmed_visit_at: new Date().toISOString() }, "Confirmed — your pro has been told.")} />
            ) : null}
            {role === "contractor" ? (
              <ChatChip label="Quick replies" icon="message-square" hot={cannedOpen} onPress={() => { setCannedOpen((o) => !o); setTimeOpen(false); }} />
            ) : null}
          </ScrollView>
          {cannedOpen ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2, paddingHorizontal: t.s4, paddingTop: t.s2 }}>
              {CANNED.map((c) => <ChatChip key={c} label={c} onPress={() => fillInput(c)} />)}
            </View>
          ) : null}
          {pending ? <PendingPreview p={pending} onRemove={() => setPending(null)} /> : null}
          <ComposerRow
            value={input} onChange={setInput} inputRef={inputRef}
            placeholder={pending ? "Add a caption…" : "Type a message…"}
            onAttach={() => setAttachOpen(true)} attachLabel="Attach photo or video"
            onSend={() => void send()} canSend={canSend} sending={sending}
          />
        </View>
      )}

      <AttachSheet open={attachOpen} onClose={() => setAttachOpen(false)} videos onPick={pickAsset} onError={setErr} />
      {/* Mounted only while open, so "now" (which hours are already past) is read at opening. */}
      {timeOpen ? (
        <SuggestTimeSheet onClose={() => setTimeOpen(false)}
          onPick={(d) => { setTimeOpen(false); fillInput("How about " + formatWhen(d) + "?"); }} />
      ) : null}
      {job ? (
        <ChatTimePrompt open={promptOpen} job={job} title={service}
          onClose={() => setPromptOpen(false)}
          onResolved={onTimeResolved}
          onSuggest={() => { setPromptOpen(false); setTimeout(() => inputRef.current?.focus(), 300); }} />
      ) : null}
    </Screen>
  );
}

/**
 * "Suggest a time" (web: a datetime-local input). A day and an hour, then the words go
 * into the box as a normal sentence, so detectDateTime picks it back up and the other
 * side gets the same accept/suggest prompt a typed time would.
 */
function SuggestTimeSheet({ onClose, onPick }: { onClose: () => void; onPick: (d: Date) => void }) {
  const { t } = useTheme();
  const [day, setDay] = useState(0);
  const [hour, setHour] = useState<number | null>(null);
  const [now] = useState(() => Date.now());
  const today = new Date(now);
  const days = Array.from({ length: 14 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));
  const hours = Array.from({ length: 14 }, (_, i) => 7 + i); // 7 AM – 8 PM
  const at = (h: number) => { const d = days[day]; return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0, 0); };
  const dayLabel = (d: Date, i: number) => (i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }));
  const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const chosen = hour !== null && at(hour).getTime() > now ? at(hour) : null;
  return (
    <BottomSheet open onClose={onClose} label="Suggest a time">
      <Txt variant="label" size={1.1}>SUGGEST A TIME</Txt>
      <Txt size={0.8} color={rgba(t.muted, 0.6)} style={{ marginTop: t.s3, marginBottom: t.s2 }}>Day</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.s2 }}>
        {days.map((d, i) => <ChatChip key={i} label={dayLabel(d, i)} hot={day === i} onPress={() => setDay(i)} />)}
      </ScrollView>
      <Txt size={0.8} color={rgba(t.muted, 0.6)} style={{ marginTop: t.s4, marginBottom: t.s2 }}>Time</Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2 }}>
        {hours.map((h) => <ChatChip key={h} label={hourLabel(h)} hot={hour === h} disabled={at(h).getTime() <= now} onPress={() => setHour(h)} />)}
      </View>
      <View style={{ marginTop: t.s5 }}>
        <Button variant="primary" full disabled={!chosen} onPress={() => { if (chosen) onPick(chosen); }}>Add to message</Button>
      </View>
    </BottomSheet>
  );
}
