// Earnings tab (PLAN step 5.9): port of web ContractorEarningsTab.
//
// SERVER VALUES ONLY. total_earned is the contractors row; the week / month / year
// figures and the trend are get_contractor_earnings_stats; a job's payout is its stored
// contractor_payout, else the server's estimate (price_preview new_payout, PLAN §0).
// The commission rate (src/lib/platformRates) only words the "your N% payout" line.
// An estimate that can't be read is not shown (web: a wrong payout is worse than none).
//
// A failed read is "couldn't load" with a retry, never $0: the stats read (flagged by
// the data provider), the logged-costs read and the response-time read each say so.
//
// Not in the app yet, on purpose: the printable payout statements / earnings summaries /
// CSV (a browser print flow; the website does them), "My Rewind", and Stripe Connect
// setup (step 5.3, needs web change E2). Each is an honest website row.
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import {
  Button, Card, DeadEnd, Field, FormNote, Group, Pill, Row, Screen, ScreenHeader, SkRow, Txt, notify, rgba, ui, useDelayed, useTheme,
} from "@/kit";
import { supabase } from "@/lib/supabase";
import { readPricePreview } from "@/features/job/pricePreview";
import { getCommissionRate } from "@/lib/platformRates";
import { respShort } from "@/lib/respTime";
import { openOnWeb } from "@/features/client/web";
import { useContractorData } from "./data";
import { jobStatusLabel } from "./rules";

type Side<T> = { ok: true; value: T } | { ok: false };
type Reads = { key: string; costs: Side<number>; resp: Side<number | null>; est: Record<string, number | null>; rate: Side<number> };

/**
 * Logged job costs, own response time, and the SERVER's payout estimate for each
 * job not yet charged (price_preview new_payout, PLAN §0: no local commission sum).
 * Each can fail alone (a failed estimate is null = unknown); never throws.
 */
async function readExtras(estIds: string[]): Promise<Omit<Reads, "key">> {
  const [exp, resp, ests, rate] = await Promise.all([
    supabase.from("job_expenses").select("amount").then((r) => r, () => ({ data: null, error: true })),
    supabase.rpc("contractor_response_stats").then((r) => r, () => ({ data: null, error: true })),
    Promise.all(estIds.map(async (id) => [id, (await readPricePreview(id, null))?.newPayout ?? null] as const)),
    // The rate is read for the WORDING only ("your 93% payout"): no figure is built from it.
    getCommissionRate(),
  ]);
  const costs: Side<number> = (exp as any).error ? { ok: false } : { ok: true, value: ((exp as any).data ?? []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0) };
  const r0 = (resp as any).error ? undefined : ((resp as any).data ?? [])[0];
  const respSide: Side<number | null> = (resp as any).error ? { ok: false } : { ok: true, value: r0 ? Number(r0.median_minutes) : null };
  return { costs, resp: respSide, est: Object.fromEntries(ests), rate: rate.ok ? { ok: true, value: rate.rate } : { ok: false } };
}

const usd0 = (n: unknown) => "$" + Number(n || 0).toFixed(0);
const usd2 = (n: number) => "$" + n.toFixed(2);

function Stat({ value, label }: { value: string; label: string }) {
  const { t } = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: "30%", minWidth: t.hCtl * 2, padding: t.s3, borderRadius: t.r3, borderWidth: t.hairW, borderColor: t.cardBorder, backgroundColor: t.cardBg, alignItems: "center" }}>
      <Txt variant="label" size={1.5}>{value}</Txt>
      <Txt variant="label" size={0.72} color={rgba(t.muted, 0.7)} style={{ textAlign: "center" }}>{label.toUpperCase()}</Txt>
    </View>
  );
}

const histTone = (s: string) => (s === "completed" ? "good" : s === "cancelled" ? "neutral" : s === "pending_confirmation" ? "warn" : "neutral") as "good" | "warn" | "neutral";

export function EarningsScreen() {
  const { t } = useTheme();
  const { state, reload } = useContractorData();
  const showSkeleton = useDelayed();
  const [reads, setReads] = useState<Reads | null>(null);
  const [nonce, setNonce] = useState(0);
  const [goalInput, setGoalInput] = useState<string | null>(null);
  const [savingGoal, setSavingGoal] = useState(false);

  const uid = state.kind === "ok" ? state.data.userId : null;
  // Jobs priced but not charged yet: the ones whose payout only the server can estimate.
  const estKey = state.kind === "ok"
    ? state.data.jobs.filter((j) => j.contractor_payout == null && Number(j.amount) > 0 && j.status !== "cancelled").map((j) => j.id + ":" + j.amount).join(",")
    : "";
  const key = `${uid}|${nonce}|${estKey}`;
  // Reads keyed on the signed-in pro, the retry counter and the jobs to estimate: a result only shows under the key it was read for.
  useEffect(() => {
    if (!uid) return;
    let stale = false;
    const ids = estKey ? estKey.split(",").map((x) => x.split(":")[0]) : [];
    void readExtras(ids).then((r) => { if (!stale) setReads({ key, ...r }); });
    return () => { stale = true; };
  }, [uid, key, estKey]);

  if (state.kind === "error") return <DeadEnd msg="We couldn't load your earnings. Check your connection, then try again." onRetry={() => void reload()} />;
  if (state.kind === "loading") {
    return (
      <Screen>
        <ScreenHeader title="Earnings" back={false} />
        {showSkeleton ? <View style={{ paddingTop: t.s6, gap: t.s4 }}><SkRow /><SkRow /><SkRow /></View> : null}
      </Screen>
    );
  }

  const d = state.data;
  const extras = reads && reads.key === key ? reads : null;
  const rate = extras?.rate.ok ? extras.rate.value : null;
  const c = d.contractor;
  const earn = d.earnStats;
  const totalEarned = Number(c?.total_earned ?? 0);

  // Web netPayout: the stored contractor_payout always wins; else the server's
  // estimate (price_preview); else unknown, never a confident $0.00 (CodeRabbit #7).
  const netPayout = (job: any): number | null => {
    if (job?.contractor_payout != null) return Number(job.contractor_payout);
    if (job?.amount == null) return null;
    return extras?.est[job.id] ?? null;
  };

  const awaitingJobs = d.jobs.filter((j) => j.status === "pending_confirmation" || j.status === "scheduled" || j.status === "in_progress");
  // If the rate could not be read the whole card is withheld rather than shown short (web).
  const awaitingUnknown = awaitingJobs.some((j) => j.amount && netPayout(j) == null);
  const awaitingTotal = awaitingUnknown ? 0 : awaitingJobs.reduce((s, j) => s + (j.amount ? (netPayout(j) ?? 0) : 0), 0);

  // Reliability streak (web): consecutive most-recent finished jobs completed with no claim.
  const claimed = new Set<string>(d.disputes.map((x: any) => x.job_id));
  const streak = (() => {
    const finished = [...d.jobs].filter((j) => j.status === "completed" || j.status === "cancelled")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    let n = 0;
    for (const j of finished) { if (j.status === "completed" && !claimed.has(j.id)) n++; else break; }
    return n;
  })();

  const week = Number(earn?.this_week || 0);
  const goal = Number(earn?.weekly_goal || 0);
  const pct = goal > 0 ? Math.min(100, Math.round((week / goal) * 100)) : 0;
  const trend: any[] = Array.isArray(earn?.trend) ? earn.trend : [];
  const peak = Math.max(1, ...trend.map((x) => Number(x.amount || 0)));

  const saveGoal = async () => {
    const g = Number(goalInput ?? (goal > 0 ? String(goal) : "")) || 0;
    setSavingGoal(true);
    try {
      const { error } = await supabase.rpc("set_weekly_goal", { p_goal: g });
      if (error) { notify("Could not save your goal: " + error.message, "danger"); return; }
      setGoalInput(null);
      await reload();
    } catch { notify("Could not save your goal. Please try again.", "danger"); }
    finally { setSavingGoal(false); }
  };

  // Wording only ("your 93% payout after the 7% fee"): percentages for a sentence, no money figure.
  const feePct = rate != null ? Math.round(rate * 100) : null;
  const ratePct = feePct != null ? 100 - feePct : null;
  const costs = extras?.costs.ok ? extras.costs.value : null;

  return (
    <Screen onRefresh={async () => { setNonce((n) => n + 1); await reload(); }}>
      <ScreenHeader title="Earnings" back={false} />

      {d.earnStatsFailed ? (
        <Card style={{ padding: t.s4, marginTop: t.s4 }}>
          <Txt variant="bodyMedium">We couldn&apos;t load your weekly earnings.</Txt>
          <Txt size={0.85} color={rgba(t.muted, 0.85)} style={{ marginTop: t.s1 }}>Your total below is still right. Check your connection, then try again.</Txt>
          <View style={{ marginTop: t.s3 }}><Button onPress={() => void reload()}>Try again</Button></View>
        </Card>
      ) : earn ? (
        <Group label="THIS WEEK">
          <Card style={{ padding: t.s4 }}>
            <Txt variant="label" size={2.2}>{usd0(week)}</Txt>
            <Txt size={0.82} color={rgba(t.muted, 0.8)}>{earn.jobs_this_week || 0} job{earn.jobs_this_week === 1 ? "" : "s"} paid out this week</Txt>
            <View style={{ marginTop: t.s4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: t.s2 }}>
                <Txt size={0.78} color={rgba(t.muted, 0.8)}>Weekly goal</Txt>
                <Txt size={0.78} color={rgba(t.muted, 0.8)} style={{ flexShrink: 1, textAlign: "right" }}>{goal > 0 ? `${usd0(week)} / ${usd0(goal)} · ${pct}%` : "Set a goal to track your week"}</Txt>
              </View>
              {goal > 0 ? (
                <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }} style={{ height: ui.meterH * 2, borderRadius: ui.pill, backgroundColor: rgba(t.fg, 0.1), overflow: "hidden", marginTop: t.s2 }}>
                  <View style={{ width: `${pct}%`, height: "100%", backgroundColor: pct >= 100 ? t.success : t.text, borderRadius: ui.pill }} />
                </View>
              ) : null}
              <Field label="Weekly goal ($)" value={goalInput ?? (goal > 0 ? String(goal) : "")} onChangeText={setGoalInput} placeholder="e.g. 1500" keyboardType="number-pad" />
              <View style={{ marginTop: t.s3 }}><Button loading={savingGoal} onPress={() => void saveGoal()}>{goal > 0 ? "Update goal" : "Set goal"}</Button></View>
            </View>
            {trend.length > 0 ? (
              <View style={{ marginTop: t.s5 }}>
                <Txt variant="label" size={0.78} color={rgba(t.muted, 0.7)}>LAST 8 WEEKS</Txt>
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: t.s1, height: t.hCtl * 1.5, marginTop: t.s2 }}>
                  {trend.map((x, i) => {
                    const h = Math.max(3, Math.round((Number(x.amount || 0) / peak) * 100));
                    return (
                      <View key={i} accessible accessibilityLabel={`${x.week}: ${usd0(x.amount)}`} style={{ flex: 1, height: "100%", justifyContent: "flex-end" }}>
                        <View style={{ width: "100%", height: `${h}%`, minHeight: 3, backgroundColor: i === trend.length - 1 ? t.text : rgba(t.fg, 0.3), borderTopLeftRadius: t.r1, borderTopRightRadius: t.r1 }} />
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s4, marginTop: t.s5 }}>
              {([["This month", earn.this_month], ["Last month", earn.last_month], ["This year", earn.this_year]] as const).map(([l, v]) => (
                <Txt key={l} size={0.85} color={rgba(t.muted, 0.8)}>{l} <Txt variant="bodyBold" size={0.85}>{usd0(v)}</Txt></Txt>
              ))}
            </View>
          </Card>
        </Group>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s3, marginTop: t.s6 }}>
        <Stat value={usd2(totalEarned)} label="Total earned" />
        <Stat value={String(c?.total_jobs ?? 0)} label="Jobs completed" />
        <Stat value={String(d.jobs.filter((j) => j.status === "assigned" || j.status === "in_progress").length)} label="Active jobs" />
        <Stat value={c?.rating ? String(c.rating) : "—"} label="Avg rating" />
        <Stat value={streak > 0 ? String(streak) : "—"} label="Reliability streak" />
        <Stat value={extras?.resp.ok && extras.resp.value != null ? respShort(extras.resp.value) : "—"} label="Response time" />
      </View>
      {extras && !extras.resp.ok ? <Txt size={0.78} color={rgba(t.muted, 0.75)} style={{ marginTop: t.s2 }}>We couldn&apos;t load your response time just now.</Txt> : null}

      {extras && !extras.costs.ok ? (
        <FormNote>We couldn&apos;t load your logged job costs just now, so your real-profit total isn&apos;t shown. Nothing has been lost: pull down to try again.</FormNote>
      ) : null}
      {costs != null && costs > 0 ? (
        <Group label="REAL PROFIT (AFTER YOUR JOB COSTS)">
          <Card style={{ padding: t.s4, gap: t.s2 }}>
            <Txt size={0.88}>Earned <Txt variant="bodyBold" size={0.88}>{usd2(totalEarned)}</Txt></Txt>
            <Txt size={0.88}>Job costs <Txt variant="bodyBold" size={0.88}>{"−" + usd2(costs)}</Txt></Txt>
            <Txt size={0.88}>Est. profit <Txt variant="bodyBold" size={0.88} color={totalEarned - costs >= 0 ? t.success : t.danger}>{usd2(totalEarned - costs)}</Txt>
              {totalEarned > 0 ? <Txt size={0.88} color={rgba(t.muted, 0.8)}>{` (${Math.round(((totalEarned - costs) / totalEarned) * 100)}% margin)`}</Txt> : null}</Txt>
            <Txt size={0.78} color={rgba(t.muted, 0.75)}>Based on the costs you&apos;ve logged on your jobs. Private to you.</Txt>
          </Card>
        </Group>
      ) : null}

      {awaitingTotal > 0 && ratePct != null && feePct != null ? (
        <Group label="COMING YOUR WAY">
          <Card style={{ padding: t.s4 }}>
            <Txt variant="bodyMedium" size={1.05}>{usd2(awaitingTotal)} coming your way</Txt>
            <Txt size={0.82} color={rgba(t.muted, 0.85)} lh={1.45} style={{ marginTop: t.s1 }}>
              {`Your ${ratePct}% payout across ${awaitingJobs.length} active job${awaitingJobs.length === 1 ? "" : "s"}, after the ${feePct}% platform fee. Clients pay a deposit up front to book you and the balance once the work is done. Every payment is held securely and released to you after the client confirms (or automatically after 3 days).`}
            </Txt>
          </Card>
        </Group>
      ) : null}
      {extras && awaitingUnknown ? (
        <FormNote>We couldn&apos;t load your payout estimates just now, so they aren&apos;t shown. Pull down to try again.</FormNote>
      ) : null}

      <Group label="PAYOUTS">
        <Card>
          {c?.stripe_payouts_enabled ? (
            <Row icon="check-circle" tone="good" title="Connected" sub="You're set up to receive payouts." />
          ) : (
            // Step 5.3 (Stripe Connect in the app) needs web change E2 first.
            <Row icon="dollar" tone="neutral" title={c?.stripe_account_id ? "Finish payout setup on the website" : "Set up payouts on the website"}
              sub="Opens freddyfixit.ca. Payout setup comes to the app in an upcoming update." chevron onPress={() => openOnWeb("/contractor-dashboard?tab=earnings")} />
          )}
        </Card>
      </Group>

      <Group label="FOR YOUR BOOKKEEPING">
        <Card>
          <Row icon="download" tone="neutral" title="Earnings summaries and payout statements" sub="Printable records and CSV are on freddyfixit.ca. Opens your earnings there." chevron
            onPress={() => openOnWeb("/contractor-dashboard?tab=earnings")} />
        </Card>
      </Group>

      <Group label="JOB HISTORY">
        <Card>
          {d.jobs.length === 0 ? (
            <Row icon="clipboard-list" tone="neutral" title="No jobs yet" sub="Jobs you win show up here once they're underway." />
          ) : d.jobs.map((j) => {
            const net = netPayout(j);
            const detail = new Date(j.created_at).toLocaleDateString("en-CA") + (j.amount ? (net != null ? " · " + usd0(j.amount) + " estimate" : "") : " · price TBD");
            return (
              <Row key={j.id} icon="briefcase" tone="neutral" title={j.request?.service_needed ?? "Job"} sub={detail}
                amount={net != null ? usd2(net) : j.amount ? usd0(j.amount) : undefined}
                right={<Pill tone={histTone(j.status)}>{jobStatusLabel(j)}</Pill>} />
            );
          })}
        </Card>
      </Group>
    </Screen>
  );
}
