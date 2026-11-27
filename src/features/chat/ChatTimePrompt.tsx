// Port of web components/ChatTimePrompt.tsx: the prompt when the OTHER person named
// a time in the job chat. Detection happens on the sender's side (JobChat sends
// chat_propose_time); this side just reads the job row.
//
// Accepting calls chat_agree_time, which can NEVER skip a payment step. It returns
// which branch it took: scheduled | proposal_updated | penciled | ignored.
// Web mounts this on the dashboards (and hides it while the chat drawer is open).
// The app also offers it from the chat screen, behind a row, because the chat is a
// screen of its own here and the dashboard isn't on screen behind it.
import React, { useState } from "react";
import { View } from "react-native";
import { BottomSheet, Button, FormNote, Ic, Stack, Txt, rgba, ui, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { formatWhen } from "@/lib/chatParse";

const DONE_COPY: Record<string, string> = {
  scheduled: "Booked. It's on your calendar and both of you have been told.",
  proposal_updated: "Time updated on the estimate. Nothing is charged until the estimate is approved in the usual way.",
  penciled: "Pencilled in. It'll show on your calendar — the formal schedule and payment still go through the normal steps.",
  ignored: "Nothing to update on this job.",
};

export function ChatTimePrompt({ open, job, title, onResolved, onSuggest, onClose }: {
  open: boolean;
  job: any;
  title: string;
  onResolved: (outcome: string) => void;
  /** Back to the composer so they can type another time. */
  onSuggest: () => void;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const [busy, setBusy] = useState<"" | "accept" | "decline">("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const when = formatWhen(job?.chat_time_at);

  const accept = async () => {
    if (busy) return;
    setBusy("accept"); setErr("");
    const { data, error } = await supabase.rpc("chat_agree_time", { p_job_id: job.id });
    setBusy("");
    if (error) { setErr(error.message || "Couldn't save that time — please try again."); return; }
    const outcome = String(data ?? "ignored");
    setDone(outcome);
    onResolved(outcome);
  };

  const suggest = async () => {
    if (busy) return;
    setBusy("decline"); setErr("");
    const { error } = await supabase.rpc("chat_decline_time", { p_job_id: job.id });
    setBusy("");
    if (error) { setErr(error.message || "Something went wrong — please try again."); return; }
    onResolved("declined");
    onSuggest();
  };

  const close = () => { if (busy) return; setDone(""); setErr(""); onClose(); };

  return (
    <BottomSheet open={open} onClose={close} label="A time was suggested in the chat">
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.s3, marginBottom: t.s4 }}>
        <Ic name="calendar" color={t.accent500} />
        <Txt variant="bodyMedium" size={0.95}>{done ? "All set" : "A time was suggested in the chat"}</Txt>
      </View>
      {done ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.s2 }}>
            <Ic name="check" color={t.success} />
            <Txt size={0.92} lh={1.6}>{when}</Txt>
          </View>
          <Txt size={0.85} lh={1.6} color={rgba(t.muted, 0.75)} style={{ marginTop: t.s2 }}>{DONE_COPY[done] ?? DONE_COPY.ignored}</Txt>
          <View style={{ marginTop: t.s4 }}><Button full onPress={close}>Done</Button></View>
        </>
      ) : (
        <>
          <Txt size={0.78} color={rgba(t.muted, 0.6)}>{title}</Txt>
          <Txt variant="bodyBold" size={1.1} color={t.accent500} style={{ marginTop: t.s1, marginBottom: t.s3 }}>{when}</Txt>
          {job?.chat_time_msg ? (
            <View style={{ borderLeftWidth: ui.stateBar, borderLeftColor: rgba(t.accentRgb, 0.5), backgroundColor: rgba(t.fg, 0.05), borderRadius: t.r1, padding: t.s3, marginBottom: t.s3 }}>
              <Txt size={0.85} lh={1.6} color={rgba(t.muted, 0.8)}>{"“" + job.chat_time_msg + "”"}</Txt>
            </View>
          ) : null}
          <Txt size={0.82} lh={1.6} color={rgba(t.muted, 0.7)}>
            Accepting puts this visit on your calendar. If it doesn&apos;t work, suggest another time in the chat and they&apos;ll get the same prompt.
          </Txt>
          {err ? <FormNote>{err}</FormNote> : null}
          <View style={{ marginTop: t.s4 }}>
            <Stack>
              <Button variant="primary" full loading={busy === "accept"} disabled={!!busy} onPress={() => void accept()}>Accept this time</Button>
              <Button full loading={busy === "decline"} disabled={!!busy} onPress={() => void suggest()}>Suggest another time</Button>
              <Button variant="ghost" full disabled={!!busy} onPress={close}>Decide later</Button>
            </Stack>
          </View>
        </>
      )}
    </BottomSheet>
  );
}
