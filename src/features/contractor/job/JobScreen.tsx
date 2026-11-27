// The contractor's job screen (PLAN 5.7): web ContractorDashboard's EXPANDED job
// card (:2386-2760), section for section and in web's order, on its own screen.
//
// The job row is the one useContractorData() already read (web: the same row the
// list renders). A failed read is the provider's DeadEnd; a job that isn't in a
// good read is "not yours any more" with a way back. Every action calls web's RPC
// with web's arguments, shows the server's own sentence on a refusal, then
// re-reads, so the screen never shows a state the server didn't confirm.
//
// "Lands on the control it names": the route's `focus` param is one of the bare
// anchors in rules.ts; AnchorScroll scrolls to it and rings it. The ONE orange
// button on the screen is the control the first attention row for this job names
// (`primaryAnchor`), the same chain the Jobs tab renders.
//
// MONEY GUARDS TOUCHED: none (payout guards 1-4 are server-side and untouched;
// nothing here moves money, computes a charge, or reads a payout off our columns).
import React, { useState } from "react";
import { Linking, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, DeadEnd, Group, Pill, Row, ScreenHeader, SkRow, Txt, askConfirm, notify, rgba, useDelayed, useTheme, Screen } from "@/kit";
import { supabase } from "@/lib/supabase";
import { photosMissing } from "@/lib/jobRules";
import { jobAwaitingBalance, jobBalanceDue } from "@/lib/jobFunding";
import { jobCode } from "@/lib/jobCode";
import { tidyDescription } from "@/lib/jobText";
import { freqLabel } from "@/lib/recurrence";
import { useServicePricing } from "@/lib/servicePricing";
import { jobChatHref } from "@/features/chat/routes";
import { bumpJobReads } from "@/features/job/refreshEpoch";
import { useContractorData, type ContractorData } from "../data";
import { priceFor } from "../bid";
import {
  A_BALANCE, A_CLAIM, A_ONWAY, CONTRACT_ANCHOR, A_PHOTOS, A_PRICE, A_RESCHED, contractorAttention, disputesByJob, jobDestination, jobStatusLabel, mapsUrl, primaryAnchor,
} from "../rules";
import { whenLong } from "../calendarRules";
import { Anchor, AnchorScroll, useAnchors } from "./anchors";
import { ContractPanel } from "./ContractPanel";
import { MilestonePanel } from "./MilestonePanel";
import { ClaimBlock, JobTimeline } from "./JobSections";
import { AssignedStage, PriceChange, WithdrawButton, type BillPrefill } from "./JobForms";
import { JobChecklist, JobExpenses, JobTimer } from "./JobTools";
import { JobPhotos } from "./JobPhotos";
import { Line, P, Panel } from "./parts";

export function ContractorJobScreen({ id, focus }: { id: string; focus?: string }) {
  const { t } = useTheme();
  const { state, reload } = useContractorData();
  const showSkeleton = useDelayed();
  if (state.kind === "error") return <DeadEnd msg="We couldn't load this job. Check your connection, then try again." onRetry={() => void reload()} />;
  if (state.kind === "loading") {
    return (
      <Screen>
        <ScreenHeader title="Job" />
        {showSkeleton ? <View style={{ paddingTop: t.s4, gap: t.s4 }}><SkRow /><SkRow /><SkRow /></View> : null}
      </Screen>
    );
  }
  const job = state.data.jobs.find((j) => j.id === id);
  if (!job) {
    // The read worked and this job isn't in it: withdrawn, reassigned or removed.
    return (
      <DeadEnd msg="This job isn't on your list any more. It may have been withdrawn or removed."
        retryLabel="Check again" onRetry={() => void reload()}
        alt={<Button variant="ghost" onPress={() => router.replace("/contractor")}>Back to Jobs</Button>} />
    );
  }
  return (
    <AnchorScroll onRefresh={async () => { bumpJobReads(); await reload(); }} focus={focus}>
      <JobBody key={job.id} job={job} d={state.data} reload={reload} />
    </AnchorScroll>
  );
}

function JobBody({ job, d, reload }: { job: any; d: ContractorData; reload: () => Promise<void> }) {
  const { t } = useTheme();
  const { scrollToAnchor } = useAnchors();
  const pricing = useServicePricing();
  const [busy, setBusy] = useState(false);
  const [bill, setBill] = useState<BillPrefill>(null);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch { notify("Something went wrong. Check your connection and try again.", "danger"); } finally { setBusy(false); }
  };

  const disputes = disputesByJob(d.disputes);
  const rows = contractorAttention({ jobs: d.jobs, contractor: d.contractor, disputes, contracts: d.contracts, contractsFailed: d.contractsFailed, openJobs: [], chatTime: [], inbox: [] });
  const primary = primaryAnchor(rows, job.id);
  const dispute = disputes[job.id];
  const dest = jobDestination(job);
  const svc = job.request?.service_needed ?? "Job";
  const price = priceFor(pricing, job.request?.service_needed);
  const minCallout = d.contractor?.min_callout ?? null;
  const hourly = d.contractor?.hourly_rate != null ? Number(d.contractor.hourly_rate) : null;
  const onError = (m: string) => notify(m, "danger");
  const gone = () => { router.replace("/contractor"); void reload(); };
  const ctx = { job, busy, run, reload };
  const miss = photosMissing(job);

  const onMyWay = () => run(async () => {
    const { error } = await supabase.rpc("contractor_on_my_way", { p_job_id: job.id });
    if (error) { notify("Couldn't update: " + error.message, "danger"); return; }
    notify("We let the client know you're on your way.");
    await reload();
  });
  const acceptReschedule = () => run(async () => {
    const { error } = await supabase.rpc("contractor_accept_reschedule", { p_job_id: job.id });
    if (error) { notify("Couldn't accept the new time: " + error.message, "danger"); return; }
    notify("New time accepted — the client's been notified.");
    await reload();
  });
  const markComplete = () => run(async () => {
    // A friendly nudge first; mark_job_complete enforces it anyway (web).
    if (photosMissing(job).length) { notify("Add " + photosMissing(job).join(" and ") + " first — the client can't confirm and release your payment without it.", "danger"); return; }
    if (!(await askConfirm({ title: "Mark job complete?", message: "The client will be asked to confirm the work and release your payment. Make sure the job is fully done before marking it complete.", confirmLabel: "Yes, mark complete" }))) return;
    const { error } = await supabase.rpc("mark_job_complete", { p_job_id: job.id, p_photo_path: null });
    if (error) { notify("Couldn't mark complete: " + error.message, "danger"); return; }
    notify("Marked complete — your client will confirm the work.");
    await reload();
  });
  const onBill = (amount: number | null, reason: string) => { setBill({ amount, reason, n: Date.now() }); scrollToAnchor(A_PRICE, 300); };

  const tools = (
    <>
      <JobTimer job={job} hourlyRate={hourly} onBill={onBill} onError={onError} />
      <JobChecklist job={job} onError={onError} />
      <JobExpenses job={job} userId={d.userId} onError={onError} />
    </>
  );

  return (
    <View>
      <ScreenHeader title={svc} />
      <Card>
        <Row icon="briefcase" tone="neutral" title={svc} sub={jobCode(job.id)} right={<Pill tone={job.status === "completed" ? "good" : "neutral"}>{jobStatusLabel(job)}</Pill>} />
        <Row icon="user" tone="neutral" title={job.client?.first_name || "Your client"} amount={job.amount ? "$" + job.amount : undefined} />
        {dest.text ? (
          // Keyed on `exact`: never label an approximate area as an address (web).
          <Row icon="map-pin" tone="neutral" title={dest.text + (dest.exact ? "" : " (approx.)")}
            sub={dest.exact ? "Service address — tap for directions" : "Approximate area only — the client confirms their full address when they pay the deposit."}
            chevron onPress={() => { Linking.openURL(mapsUrl(dest.text)).catch(() => notify("Couldn't open maps.", "danger")); }} />
        ) : null}
      </Card>
      {tidyDescription(job.request?.job_description).length > 0 ? (
        <View style={{ marginTop: t.s4, gap: t.s2 }}>
          {tidyDescription(job.request?.job_description).map((p, i) => <Txt key={i} size={0.9} lh={1.55} color={rgba(t.fg, 0.9)}>{p}</Txt>)}
        </View>
      ) : null}

      {/* Every job needs a signed agreement before the client can pay: first move (web). */}
      <ContractPanel job={job} onUpdated={reload} primary={primary === CONTRACT_ANCHOR} />
      <MilestonePanel job={job} onUpdated={reload} />
      {job.client_approved_at || ["scheduled", "pending_confirmation", "completed"].includes(job.status) ? <JobTimeline job={job} /> : null}
      {dispute ? <ClaimBlock d={dispute} userId={d.userId} primary={primary === A_CLAIM} onUpdated={reload} /> : null}

      {job.request?.recurring ? (
        <View style={{ marginTop: t.s4 }}>
          <Panel tone="accent">
            <P><Txt size={0.85} variant="bodyBold">{"Recurring job" + (job.request?.recurring_frequency ? " — " + freqLabel(job.request.recurring_frequency) : "") + ". "}</Txt>
              This client wants a regular pro. Taking it on means committing to show up at the agreed times each visit — reliable recurring work, but please only accept if you can keep the schedule.</P>
          </Panel>
        </View>
      ) : null}

      {/* Gated on the live stages: neither flag is ever cleared (web). */}
      {job.client_rescheduled_at && !job.reschedule_accepted_at && ["assigned", "scheduled", "in_progress"].includes(job.status) ? (
        <Anchor id={A_RESCHED}>
          <Panel tone="info">
            <P><Txt size={0.85} variant="bodyBold">The client changed the time </Txt>{"to " + whenLong(job.scheduled_at, "a new time") + ". Accept it, or propose a different time below if you're not available."}</P>
            <Button variant={primary === A_RESCHED ? "primary" : "secondary"} disabled={busy} onPress={() => void acceptReschedule()}>Accept new time</Button>
          </Panel>
        </Anchor>
      ) : null}

      {job.status === "assigned" ? (
        <AssignedStage {...ctx} primary={primary} minCallout={minCallout} price={price} onGone={gone} />
      ) : null}

      {job.status === "scheduled" || job.status === "in_progress" ? (
        <>
          <Line icon="calendar" color={t.success}>{"Booked for " + whenLong(job.scheduled_at) + (job.amount ? " · $" + job.amount : "") + "."}</Line>
          {Array.isArray(job.quote_items) && job.quote_items.some((i: any) => i.accepted) ? (
            <Line icon="check-circle" color={rgba(t.muted, 0.8)}>{"Add-ons the client picked: " + job.quote_items.filter((i: any) => i.accepted).map((i: any) => i.label + " ($" + i.amount + ")").join(", ") + " — included in the price above."}</Line>
          ) : null}
          {tools}
          <Anchor id={A_ONWAY}>
            <View style={{ gap: t.s3 }}>
              {dest.text ? (
                <Card>
                  <Row icon="map-pin" tone="neutral" title={dest.text} sub={dest.exact ? "Service address — tap for directions" : "Approximate area only — ask the client to confirm"}
                    chevron onPress={() => { Linking.openURL(mapsUrl(dest.text)).catch(() => notify("Couldn't open maps.", "danger")); }} />
                </Card>
              ) : null}
              {job.on_my_way_at ? (
                <Line icon="check-circle" color={t.success}>{"Client knows you're on the way"}</Line>
              ) : (
                <Button full variant={primary === A_ONWAY ? "primary" : "secondary"} loading={busy} onPress={() => void onMyWay()}>{"I'm on my way"}</Button>
              )}
            </View>
          </Anchor>
          <Anchor id={A_PHOTOS}>
            <JobPhotos job={job} onSaved={reload} onError={onError} />
          </Anchor>
          <View style={{ marginTop: t.s4, gap: t.s3 }}>
            {/* Disabled while photos are outstanding, with the reason underneath (web). */}
            {!job.is_milestone ? <Button full disabled={busy || miss.length > 0} onPress={() => void markComplete()}>Mark complete</Button> : null}
            {!job.is_milestone && miss.length > 0 ? <Txt size={0.8} color={t.accent500}>{"Add " + miss.join(" and ") + " to mark this job complete."}</Txt> : null}
            <WithdrawButton job={job} busy={busy} run={run} onGone={gone} />
          </View>
          <View style={{ marginTop: t.s4 }}><PriceChange {...ctx} minCallout={minCallout} price={price} prefill={bill} /></View>
        </>
      ) : null}

      {job.status === "pending_confirmation" ? (
        <>
          <Line icon="clock" color={t.warn}>You marked this complete — waiting for the client to confirm.</Line>
          {jobAwaitingBalance(job) ? (
            <Anchor id={A_BALANCE}>
              <Panel tone="accent">
                <P><Txt size={0.85} variant="bodyBold">{"The client still owes $" + jobBalanceDue(job).toFixed(2) + ". "}</Txt>
                  {"They paid a deposit to book you and pay the rest now the work is done. They can't confirm \u2014 and your payout can't be released \u2014 until that balance is in. We've asked them for it; a friendly message from you usually speeds it up."}</P>
              </Panel>
            </Anchor>
          ) : null}
          <View style={{ marginTop: t.s4 }}><JobPhotos job={job} onSaved={reload} onError={onError} /></View>
          {tools}
          <View style={{ marginTop: t.s4 }}><PriceChange {...ctx} minCallout={minCallout} price={price} prefill={bill} /></View>
        </>
      ) : null}

      {job.status === "completed" ? <Line icon="check-circle" color={t.success}>Job completed and confirmed.</Line> : null}

      <Group label="Messages">
        <Card>
          <Row icon="message-square" tone="neutral" title={(job.status === "completed" ? "View chat with " : "Message ") + (job.client?.first_name || "your client")} chevron
            onPress={() => router.push(jobChatHref("contractor", job.id))} />
        </Card>
      </Group>
    </View>
  );
}
