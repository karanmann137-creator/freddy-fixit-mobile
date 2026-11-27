// Read-mostly sections of the contractor job screen (PLAN 5.7):
//   · JobTimeline  — port of web components/JobTimeline.tsx (display only)
//   · ClaimBlock   — the claim panel from ContractorDashboard.tsx:2455 plus
//                    RespondToClaim.tsx, inline (respond_to_dispute, same paths)
//   · ScheduleField — port of web components/ScheduleField.tsx on the CALGARY clock
import React, { useEffect, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { Button, Card, Field, Group, Ic, Stepper, Txt, rgba, ui, useTheme, type StepState } from "@/kit";
import { supabase } from "@/lib/supabase";
import { jobFullyFunded } from "@/lib/jobFunding";
import type { UploadAsset } from "@/lib/imageCompress";
import { uploadImage } from "@/platform/upload";
import { LinkButton } from "@/features/request/pieces";
import { A_CLAIM } from "../rules";
import { TZ, calgaryToday, keyOf, monthCells, monthLabel, shiftMonth, type YM } from "../calendarRules";
import { Segmented } from "../Segmented";
import { Anchor } from "./anchors";
import { pickPhoto } from "./JobPhotos";
import { ErrLine, P, Panel, PanelHead } from "./parts";

const short = (ts: string | null) => {
  if (!ts) return undefined;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleString("en-CA", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

// ── JobTimeline ──────────────────────────────────────────────────────────────
export function JobTimeline({ job }: { job: any }) {
  const { t } = useTheme();
  const paid = job.payment_status === "held" || job.payment_status === "released" || !!job.paid_at;
  const disputed = job.payment_status === "disputed";
  const depRate = Number(job.deposit_rate);
  const split = depRate > 0 && depRate < 1;
  const steps: { label: string; at: string | null; done: boolean }[] = [
    { label: "Contractor matched", at: job.created_at ?? null, done: true },
    { label: "Time scheduled", at: job.client_approved_at ?? null, done: !!job.client_approved_at },
    { label: split ? "Deposit secured" : "Payment secured", at: job.deposit_paid_at ?? job.paid_at ?? null, done: paid },
    { label: "Contractor on the way", at: job.on_my_way_at ?? null, done: !!job.on_my_way_at },
    { label: "Work completed", at: job.contractor_completed_at ?? null, done: !!job.contractor_completed_at },
    ...(split ? [{ label: "Balance paid", at: null, done: paid && jobFullyFunded(job) }] : []),
    { label: "Confirmed & released", at: job.client_confirmed_at ?? null, done: !!job.client_confirmed_at },
  ];
  const active = steps.findIndex((s) => !s.done);
  const state = (done: boolean, i: number): StepState => (done ? "done" : i !== active ? "todo" : disputed ? "review" : "now");
  return (
    <Group label="Job progress">
      <Card>
        <Stepper steps={steps.map((s, i) => ({ title: s.label, sub: s.done ? short(s.at) : undefined, state: state(s.done, i) }))} />
        {disputed ? (
          <View style={{ padding: t.s3, borderTopWidth: t.hairW, borderTopColor: t.hair }}>
            <Txt size={0.8} color={t.warn}>Paused — a problem was reported and is under review.</Txt>
          </View>
        ) : null}
      </Card>
    </Group>
  );
}

// ── ClaimBlock ───────────────────────────────────────────────────────────────
// MONEY GUARDS TOUCHED: none. The claim pause is the server's; this only shows
// the claim and sends the pro's side (respond_to_dispute).
export function ClaimBlock({ d, userId, primary, onUpdated }: { d: any; userId: string; primary: boolean; onUpdated: () => Promise<unknown> | void }) {
  const { t } = useTheme();
  const open = d.status === "open";
  const responded = !!d.contractor_responded_at;
  const deadline = d.response_deadline ? new Date(d.response_deadline) : null;
  const [openedAt] = useState(() => Date.now());
  const overdue = deadline ? deadline.getTime() < openedAt : false;
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [replying, setReplying] = useState(false);
  const [response, setResponse] = useState("");
  const [files, setFiles] = useState<UploadAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const signed: Record<string, string> = {};
      for (const p of (d.photo_paths ?? []) as string[]) {
        const { data } = await supabase.storage.from("problem-photos").createSignedUrl(p, 3600);
        if (data?.signedUrl) signed[p] = data.signedUrl;
      }
      if (alive) setPhotos(signed);
    })();
    return () => { alive = false; };
  }, [d.photo_paths]);

  const add = async (camera: boolean) => {
    const got = await pickPhoto(camera);
    if (!got) return;
    if ("error" in got) { setErr(got.error); return; }
    setErr(null);
    setFiles((p) => [...p, got].slice(0, 5));
  };

  const submit = async () => {
    if (!response.trim()) { setErr("Please write your response."); return; }
    setBusy(true); setErr(null);
    try {
      const paths: string[] = [];
      for (const f of files) {
        const up = await uploadImage({ bucket: "problem-photos", basePath: userId + "/resp-" + d.id + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8), asset: f, profile: "photo", evidence: true });
        if (!up.ok) throw new Error(up.message + (up.blocked ? " Please remove it and submit again — your written response is still here." : ""));
        paths.push(up.path);
      }
      const { error } = await supabase.rpc("respond_to_dispute", { p_dispute_id: d.id, p_response: response.trim(), p_photos: paths });
      if (error) throw new Error(error.message);
      setReplying(false);
      await onUpdated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <Anchor id={A_CLAIM}>
      <Panel tone="warn">
        <PanelHead icon="alert-triangle" color={t.warn}>{open ? "THE CLIENT FILED A CLAIM ON THIS JOB" : "CLAIM RESOLVED"}</PanelHead>
        <P>{"Your payout is paused while our team reviews. "}<Txt size={0.85} variant="bodyBold">{d.reason}</Txt></P>
        {d.description ? <P>{"“" + d.description + "”"}</P> : null}
        {d.requested_remedy ? <Txt size={0.78} color={rgba(t.muted, 0.6)}>{"Requested outcome: " + d.requested_remedy}</Txt> : null}
        {d.service_date ? <Txt size={0.78} color={rgba(t.muted, 0.6)}>{"Date of service: " + d.service_date}</Txt> : null}
        {Object.keys(photos).length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2 }}>
            {Object.entries(photos).map(([p, u]) => <Image key={p} source={{ uri: u }} accessibilityLabel="Claim photo" style={{ width: ui.photoTile, height: ui.photoTile, borderRadius: t.r2 }} />)}
          </View>
        ) : null}
        {open && !responded ? (
          <>
            <Txt size={0.8} color={overdue ? t.danger : t.warn}>
              {overdue ? "Your response window has passed — you can still respond until our team decides." : "Please respond by " + (deadline ? deadline.toLocaleDateString("en-CA", { timeZone: TZ }) : "the deadline") + "."}
            </Txt>
            {!replying ? (
              <Button variant={primary ? "primary" : "secondary"} onPress={() => setReplying(true)}>Respond to claim</Button>
            ) : (
              <View style={{ gap: t.s3 }}>
                <P>Share your side — what was done, and anything that helps explain what happened. Our team reviews both sides before deciding.</P>
                <Field label="Your response" multiline value={response} onChangeText={setResponse} placeholder="Explain your side in your own words…" />
                <Txt size={0.8} color={rgba(t.muted, 0.7)}>{"Photos (optional, up to 5)" + (files.length ? ": " + files.length + " added" : "")}</Txt>
                <View style={{ flexDirection: "row", columnGap: t.s4, flexWrap: "wrap" }}>
                  {files.length < 5 ? <LinkButton onPress={() => void add(true)}>Take photo</LinkButton> : null}
                  {files.length < 5 ? <LinkButton onPress={() => void add(false)}>Choose photo</LinkButton> : null}
                  {files.length > 0 ? <LinkButton onPress={() => setFiles([])}>Remove photos</LinkButton> : null}
                </View>
                <ErrLine>{err}</ErrLine>
                <Button variant={primary ? "primary" : "secondary"} loading={busy} onPress={() => void submit()}>Send my response</Button>
                <Button variant="ghost" disabled={busy} onPress={() => setReplying(false)}>Cancel</Button>
              </View>
            )}
          </>
        ) : null}
        {responded ? (
          <View style={{ gap: t.s1 }}>
            <Txt size={0.82} color={t.success}>Your response was submitted. Our team is reviewing both sides.</Txt>
            {d.contractor_response ? <Txt size={0.82} color={rgba(t.muted, 0.75)}>{"“" + d.contractor_response + "”"}</Txt> : null}
          </View>
        ) : null}
      </Panel>
    </Anchor>
  );
}

// ── ScheduleField (web ScheduleField.tsx, Calgary clock) ─────────────────────
// value / onChange: "YYYY-MM-DDTHH:mm" read on the Calgary clock (calendarRules
// calgaryWallToIso turns it into the instant the RPC gets). Past days are disabled
// against CALGARY's today, never the phone's.
const WEEK = ["S", "M", "T", "W", "T", "F", "S"];
const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 15, 30, 45];
const pad = (n: number) => String(n).padStart(2, "0");

export function ScheduleField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTheme();
  const today = calgaryToday();
  const parsed = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || "");
  const [cur, setCur] = useState<YM>(parsed ? { y: Number(parsed[1]), m: Number(parsed[2]) - 1 } : today.ym);
  const dayKey = parsed ? parsed[1] + "-" + parsed[2] + "-" + parsed[3] : null;
  const h24 = parsed ? Number(parsed[4]) : 9;
  // Local, like web: a time picked before a day is kept, and sent with the day.
  const [minute, setMinute] = useState(parsed ? Number(parsed[5]) : 0);
  const [ampm, setAmpm] = useState<"AM" | "PM">(h24 >= 12 ? "PM" : "AM");
  const [hour12, setHour12] = useState(h24 % 12 === 0 ? 12 : h24 % 12);

  const emit = (o: { key?: string; hour12?: number; minute?: number; ampm?: "AM" | "PM" }) => {
    if (o.hour12 != null) setHour12(o.hour12);
    if (o.minute != null) setMinute(o.minute);
    if (o.ampm) setAmpm(o.ampm);
    const key = o.key ?? dayKey;
    if (!key) return; // no date chosen yet: nothing to propose (web)
    let h = (o.hour12 ?? hour12) % 12;
    if ((o.ampm ?? ampm) === "PM") h += 12;
    onChange(key + "T" + pad(h) + ":" + pad(o.minute ?? minute));
  };

  const cells = monthCells(cur);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const atFirst = cur.y === today.ym.y && cur.m === today.ym.m;
  const summary = dayKey
    ? new Date(dayKey + "T12:00:00Z").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) + " · " + hour12 + ":" + pad(minute) + " " + ampm + " (Calgary time)"
    : "Pick a day below";

  return (
    <View style={{ gap: t.s3 }}>
      <Txt variant="bodyMedium" size={0.88} color={dayKey ? t.text : rgba(t.muted, 0.6)}>{summary}</Txt>
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.s2 }}>
        <Txt variant="label" size={1.05} style={{ flex: 1 }}>{monthLabel(cur)}</Txt>
        <Button variant="ghost" disabled={atFirst} accessibilityLabel="Previous month" onPress={() => setCur(shiftMonth(cur, -1))}><Ic name="chevron-down" size={ui.icon.lg} rotate={90} /></Button>
        <Button variant="ghost" accessibilityLabel="Next month" onPress={() => setCur(shiftMonth(cur, 1))}><Ic name="chevron-down" size={ui.icon.lg} rotate={-90} /></Button>
      </View>
      <View style={{ gap: t.s1 }}>
        <View style={{ flexDirection: "row", gap: t.s1 }}>
          {WEEK.map((w, i) => <Txt key={i} variant="label" size={0.68} color={rgba(t.muted, 0.5)} style={{ flex: 1, textAlign: "center" }}>{w}</Txt>)}
        </View>
        {weeks.map((wk, wi) => (
          <View key={wi} style={{ flexDirection: "row", gap: t.s1 }}>
            {wk.map((d, i) => {
              if (d == null) return <View key={"e" + i} style={{ flex: 1 }} />;
              const k = keyOf(cur.y, cur.m, d);
              const past = k < today.key;
              const sel = k === dayKey;
              return (
                <Pressable key={k} disabled={past} onPress={() => emit({ key: k })} accessibilityRole="button" accessibilityState={{ selected: sel, disabled: past }}
                  accessibilityLabel={k} hitSlop={{ left: t.s1, right: t.s1 }}
                  style={{ flex: 1, minWidth: 0, minHeight: t.hCtl, alignItems: "center", justifyContent: "center", borderRadius: t.r2,
                    backgroundColor: sel ? rgba(t.fg, 0.16) : past ? "transparent" : rgba(t.fg, 0.05),
                    borderWidth: k === today.key || sel ? ui.line : 0, borderColor: sel ? t.text : rgba(t.fg, 0.3) }}>
                  <Txt size={0.84} variant={sel ? "bodyBold" : "body"} color={past ? rgba(t.muted, 0.25) : t.text}>{d}</Txt>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <Txt variant="label" size={0.72} color={rgba(t.muted, 0.6)}>TIME</Txt>
      <Segmented label="Hour" value={hour12} onChange={(v) => emit({ hour12: v })} options={HOURS.map((h) => ({ value: h, label: String(h) }))} />
      <Segmented label="Minutes" value={minute} onChange={(v) => emit({ minute: v })} options={MINUTES.map((m) => ({ value: m, label: ":" + pad(m) }))} />
      <Segmented label="AM or PM" value={ampm} onChange={(v) => emit({ ampm: v })} options={[{ value: "AM" as const, label: "AM" }, { value: "PM" as const, label: "PM" }]} />
    </View>
  );
}
