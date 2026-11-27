// "Split job": the contractor's half of web components/MilestonePanel.tsx (PLAN
// 5.7). A job over $2,000 can be paid in 2–5 stages: the pro proposes the stage
// plan (propose_milestones) until the client approves it, then marks each FUNDED
// stage complete with a photo (complete_milestone).
//
// MONEY GUARDS TOUCHED: none. Stage money lives on job_milestones (never
// funded_amount, by construction); this side only proposes a plan the server
// checks and marks a funded stage complete. Funding, approval and release are the
// client's (approve_milestone → release-payment) and are not here. Amounts shown
// are the server's rows (amount, contractor_payout); the suggested split is web's
// own prefill and the server rejects a plan that doesn't sum to the job price.
import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Field, Txt, rgba, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { beforeRequired } from "@/lib/jobRules";
import type { UploadAsset } from "@/lib/imageCompress";
import { uploadImage } from "@/platform/upload";
import { LinkButton } from "@/features/request/pieces";
import { moneyInput } from "../bid";
import { pickPhoto } from "./JobPhotos";
import { ErrLine, OkLine, P, Panel, PanelHead, defer } from "./parts";

type Milestone = { id: string; seq: number; title: string; amount: number; contractor_payout: number; status: string; completion_photo_path: string | null };

const money = (n: number) => "$" + (Math.round(n * 100) / 100).toFixed(2);
const STATUS_LABEL: Record<string, string> = {
  pending: "Not funded", funded: "Funded — in progress", completed: "Done — awaiting the client's OK",
  released: "Paid out", disputed: "Disputed", refunded: "Refunded to client",
};
// web DEFAULT_SPLIT: a starting suggestion only.
const DEFAULT_SPLIT = [{ title: "Deposit", pct: 0.2 }, { title: "Rough-in", pct: 0.3 }, { title: "Substantial", pct: 0.3 }, { title: "Final", pct: 0.2 }];
function suggestStages(total: number) {
  let running = 0;
  return DEFAULT_SPLIT.map((s, i) => {
    let amt: number;
    if (i === DEFAULT_SPLIT.length - 1) amt = Math.round((total - running) * 100) / 100;
    else { amt = Math.round(total * s.pct * 100) / 100; running += amt; }
    return { title: s.title, amount: String(amt) };
  });
}

export function MilestonePanel({ job, onUpdated }: { job: any; onUpdated: () => Promise<unknown> | void }) {
  const { t } = useTheme();
  const total = Number(job?.amount ?? 0);
  const [milestones, setMilestones] = useState<Milestone[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [stages, setStages] = useState<{ title: string; amount: string }[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [photoFor, setPhotoFor] = useState<Record<string, UploadAsset>>({});
  // Local override after a send; otherwise the job row's own status (re-read via onUpdated).
  const [schedOverride, setSchedStatus] = useState<string | null>(null);
  const savedStatus: string | null = job?.milestone_schedule_status ?? null;
  const jobId: string = job.id;
  const schedStatus = schedOverride ?? savedStatus;
  const applies = !(total <= 2000 && !job?.is_milestone); // web self-gate, unchanged

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_job_milestones", { p_job_id: jobId });
    if (error) { setLoadFailed(true); setMilestones([]); return; }
    const rows = (data ?? []) as unknown as Milestone[];
    setLoadFailed(false);
    setMilestones(rows);
    // Seed the builder from the plan, or from the suggested split (web: same effect, run on load).
    setStages(rows.length > 0 ? rows.map((m) => ({ title: m.title, amount: String(m.amount) })) : suggestStages(total));
    if (rows.length === 0 && savedStatus !== "approved") setShowBuilder(true);
  }, [jobId, savedStatus, total]);
  useEffect(() => { if (applies) defer(load); }, [applies, load]);

  if (!applies) return null;
  if (milestones === null) return <View style={{ marginTop: t.s4 }}><Panel tone="accent"><PanelHead icon="clipboard-list">MILESTONE PAYMENTS</PanelHead><P>Loading the payment plan…</P></Panel></View>;
  if (loadFailed) {
    return (
      <View style={{ marginTop: t.s4 }}>
        <Panel tone="accent">
          <PanelHead icon="alert-triangle">MILESTONE PAYMENTS</PanelHead>
          <P>{"We couldn't load the payment plan for this job just now. Nothing has changed and no payment has been affected. If it keeps happening, email hello@freddyfixit.ca."}</P>
          <Button onPress={() => { setMilestones(null); void load(); }}>Try again</Button>
        </Panel>
      </View>
    );
  }

  const busy = busyKey !== null;
  const run = async (key: string, fn: () => Promise<void>) => {
    if (busyKey) return;
    setBusyKey(key); setErr(null); setMsg(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusyKey(null); }
  };
  const stageSum = stages.reduce((a, s) => a + (Number(s.amount) || 0), 0);
  const sumOk = Math.round(stageSum * 100) === Math.round(total * 100);

  const propose = () => run("plan", async () => {
    if (!sumOk) throw new Error("Stage amounts must add up to the estimate " + money(total));
    const payload = stages.map((s) => ({ title: s.title.trim() || "Stage", amount: Number(s.amount) }));
    const { error } = await supabase.rpc("propose_milestones", { p_job_id: job.id, p_stages: payload });
    if (error) throw new Error(error.message);
    setShowBuilder(false); setSchedStatus("proposed"); setMsg("Plan sent — the client will approve it.");
    await load(); await onUpdated();
  });

  const complete = (m: Milestone) => run(m.id, async () => {
    const asset = photoFor[m.id];
    if (!asset && !m.completion_photo_path) throw new Error("Add a photo of this stage's finished work first — the client can't release payment without it.");
    if (!job?.before_photo_path && beforeRequired(job)) throw new Error("Add the job's “before” photo first — it's in the Before & after photos box on this job.");
    let path: string | null = null;
    if (asset) {
      const up = await uploadImage({ bucket: "completion-photos", basePath: job.id + "/milestone-" + m.id + "-" + Date.now(), asset, profile: "photo", evidence: true });
      if (!up.ok) throw new Error(up.message);
      path = up.path;
    }
    const { error } = await supabase.rpc("complete_milestone", { p_milestone: m.id, p_photo: path });
    if (error) throw new Error(error.message);
    setPhotoFor((p) => { const n = { ...p }; delete n[m.id]; return n; });
    setMsg("Stage marked complete — the client will review and release payment.");
    await load(); await onUpdated();
  });

  const choose = async (id: string, camera: boolean) => {
    const got = await pickPhoto(camera);
    if (!got) return;
    if ("error" in got) { setErr(got.error); return; }
    setErr(null);
    setPhotoFor((p) => ({ ...p, [id]: got }));
  };

  const head = (
    <>
      <ErrLine>{err}</ErrLine>
      <OkLine>{msg}</OkLine>
    </>
  );

  if (schedStatus !== "approved") {
    const proposed = schedStatus === "proposed";
    return (
      <View style={{ marginTop: t.s4 }}>
        <Panel tone="accent">
          <PanelHead icon="clipboard-list">MILESTONE PAYMENT PLAN</PanelHead>
          <P>{"This job is over $2,000, so the client can pay in stages. Break the " + money(total) + " estimate into 2–5 stages — they fund each stage as it starts and you're paid as each is approved."}</P>
          {head}
          {showBuilder || !proposed ? (
            <>
              {stages.map((st, i) => (
                <View key={i} style={{ flexDirection: "row", gap: t.s2, alignItems: "flex-end" }}>
                  <View style={{ flex: 2 }}><Field label={"Stage " + (i + 1)} value={st.title} onChangeText={(v) => setStages((p) => p.map((s, j) => (j === i ? { ...s, title: v } : s)))} /></View>
                  <View style={{ flex: 1 }}><Field label="$" keyboardType="decimal-pad" value={st.amount} onChangeText={(v) => setStages((p) => p.map((s, j) => (j === i ? { ...s, amount: moneyInput(v) } : s)))} /></View>
                  {stages.length > 2 ? <Button variant="ghost" accessibilityLabel={"Remove stage " + (i + 1)} onPress={() => setStages((p) => (p.length <= 2 ? p : p.filter((_, j) => j !== i)))}>Remove</Button> : null}
                </View>
              ))}
              <Txt size={0.84} variant="bodyMedium" color={sumOk ? t.success : t.warn}>{"Stages total " + money(stageSum) + " / " + money(total) + (sumOk ? " ✓" : " — must match")}</Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: t.s4 }}>
                {stages.length < 5 ? <LinkButton onPress={() => setStages((p) => (p.length >= 5 ? p : [...p, { title: "Stage " + (p.length + 1), amount: "0" }]))}>+ Add stage</LinkButton> : null}
                <LinkButton onPress={() => setStages(suggestStages(total))}>Reset to suggested</LinkButton>
              </View>
              <Button loading={busyKey === "plan"} disabled={busy || !sumOk} onPress={() => void propose()}>{proposed ? "Update plan" : "Send plan to client"}</Button>
            </>
          ) : (
            <>
              <Txt size={0.84} color={t.warn}>Plan sent — waiting for the client to approve it.</Txt>
              {(milestones ?? []).map((m) => (
                <View key={m.id} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Txt size={0.86}>{m.seq + ". " + m.title}</Txt><Txt size={0.86} variant="bodyMedium">{money(m.amount)}</Txt>
                </View>
              ))}
              <Button onPress={() => setShowBuilder(true)}>Edit plan</Button>
            </>
          )}
        </Panel>
      </View>
    );
  }

  if (milestones.length === 0) return null;
  const anyDisputed = milestones.some((m) => m.status === "disputed");
  return (
    <View style={{ marginTop: t.s4 }}>
      <Panel tone="accent">
        <PanelHead icon="clipboard-list">{"MILESTONE PAYMENTS — " + money(total) + " IN " + milestones.length + " STAGES"}</PanelHead>
        {head}
        {anyDisputed ? <Txt size={0.82} lh={1.5} color={t.danger}>A stage is under dispute. The rest of the plan is paused until our team resolves it.</Txt> : null}
        {milestones.map((m) => (
          <View key={m.id} style={{ padding: t.s3, gap: t.s2, borderRadius: t.r2, backgroundColor: rgba(t.fg, 0.04), borderWidth: t.hairW, borderColor: rgba(t.fg, 0.08) }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: t.s2 }}>
              <Txt variant="bodyMedium" size={0.9} style={{ flex: 1 }}>{m.seq + ". " + m.title}</Txt>
              <Txt variant="bodyMedium" size={0.9} color={t.success}>{money(m.amount)}</Txt>
            </View>
            <Txt size={0.76} variant="bodyMedium" color={m.status === "released" ? t.success : m.status === "disputed" ? t.danger : m.status === "completed" ? t.warn : rgba(t.muted, 0.8)}>{"● " + (STATUS_LABEL[m.status] ?? m.status)}</Txt>
            {m.status === "funded" ? (
              <View style={{ gap: t.s2 }}>
                <Txt size={0.78} variant="bodyBold" color={t.accent500}>{"Photo of this stage's finished work \u2014 required"}</Txt>
                <View style={{ flexDirection: "row", columnGap: t.s4, flexWrap: "wrap" }}>
                  <LinkButton onPress={() => void choose(m.id, true)}>Take photo</LinkButton>
                  <LinkButton onPress={() => void choose(m.id, false)}>Choose photo</LinkButton>
                </View>
                {photoFor[m.id] ? <Txt size={0.76} color={t.success}>✓ Photo ready</Txt> : null}
                <Txt size={0.74} lh={1.4} color={rgba(t.muted, 0.6)}>{"The client can't release payment for this stage without it. Your job-level \u201cbefore\u201d photo is also needed."}</Txt>
                <Button loading={busyKey === m.id} disabled={busy || !(photoFor[m.id] || m.completion_photo_path)} onPress={() => void complete(m)}>Mark stage complete</Button>
              </View>
            ) : null}
            {m.status === "pending" ? <Txt size={0.78} color={rgba(t.muted, 0.6)}>Waiting for the client to fund this stage.</Txt> : null}
            {m.status === "completed" ? <Txt size={0.78} color={t.warn}>{"Awaiting the client's approval to release " + money(m.contractor_payout) + "."}</Txt> : null}
            {m.status === "released" ? <Txt size={0.78} color={t.success}>{money(m.contractor_payout) + " paid to you."}</Txt> : null}
          </View>
        ))}
      </Panel>
    </View>
  );
}
