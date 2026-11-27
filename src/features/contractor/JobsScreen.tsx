// Jobs tab (PLAN step 5.6): the pass, "Needs your attention" (web's contractor
// `else if` chain, max 4 rows), the JobSwitcher, the active job's card and the
// rest of the pro's jobs. Port of the top of web ContractorDashboard (:1709-2420).
//
// ONE list, three readers: `rows` (rules.ts contractorAttention) drives the
// AttentionCard, the pass and the switcher dots, so they can never disagree
// about whether anything is on this pro (web's reason for hoisting `shownAttn`).
// Every row lands on the control it names: /contractor/job/<id>?focus=<anchor>.
//
// Not ported (judgement, see the PR): the "Get set up" checklist, the job search
// box and the pipeline-stage filter (web shows them on wide screens beside this
// list), and the row's "hide for now" ×, which was session-only on web and every
// row in the card is a money gate or live state.
import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import {
  AttentionCard, Card, DeadEnd, Group, Hero, HeroSub, JobSwitcher, Pass, PassMeta, PassMetaItem, PassTop, Pill, Row, Screen, SkRow, StateLine,
  useDelayed, useTheme,
} from "@/kit";
import { useConversations, type Conversation } from "@/lib/chatUnread";
import { bidToConversation, useBidThreads } from "@/lib/bidThreads";
import { jobCode } from "@/lib/jobCode";
import { formatWhen } from "@/features/client/rules";
import { openOnWeb } from "@/features/client/web";
import { useContractorData } from "./data";
import { CalendarView } from "./CalendarView";
import { Segmented } from "./Segmented";
import {
  chatTimeJobs, contractorAttention, contractorNav, contractorPass, disputesByJob, jobDestination, jobHasRow, jobStatusLabel, liveJobsOf, navCounts,
  type AttnRow,
} from "./rules";

/** Where a row's control lives (web's onClick bodies). */
export function goToRow(a: AttnRow) {
  const act = a.action;
  if (act.kind === "payouts") return openOnWeb("/contractor-dashboard"); // Stripe Connect in the app is step 5.3 (needs web E2)
  if (act.kind === "available") return router.push("/contractor/available");
  if (act.kind === "messages") return router.push("/contractor/messages");
  // TODO: jobChatHref after merge (JobChat, PLAN 4.10, merged on phase-7/live-jobs).
  if (act.kind === "chat") return router.push(`/contractor/chat/${act.jobId}`);
  return router.push({ pathname: "/contractor/job/[id]", params: { id: act.jobId, focus: act.anchor } });
}

const openJob = (id: string) => router.push({ pathname: "/contractor/job/[id]", params: { id } });

export function JobsScreen() {
  const { t } = useTheme();
  const { state, reload } = useContractorData();
  const showSkeleton = useDelayed();
  const [mode, setMode] = useState<"list" | "calendar">("list");
  const [activeId, setActiveId] = useState<string | null>(null);
  const userId = state.kind === "ok" ? state.data.userId : null;
  // The same two inbox halves web merges (job threads + started bid threads).
  const convs = useConversations(userId);
  const bid = useBidThreads(userId);

  if (state.kind === "error") return <DeadEnd msg="We couldn't load your jobs. Check your connection, then try again." onRetry={() => void reload()} />;
  if (state.kind === "loading") {
    return <Screen>{showSkeleton ? <View style={{ paddingTop: t.s6, gap: t.s4 }}><SkRow /><SkRow /><SkRow /></View> : null}</Screen>;
  }
  const d = state.data;
  const inbox: Conversation[] = [...convs.conversations, ...bid.started.map((x) => bidToConversation(x, d.userId))]
    .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
  const rows = contractorAttention({
    jobs: d.jobs, contractor: d.contractor, disputes: disputesByJob(d.disputes),
    contracts: d.contracts, contractsFailed: d.contractsFailed,
    openJobs: d.openJobs, chatTime: chatTimeJobs(d.jobs, d.userId), inbox,
  });
  const pass = contractorPass({ rows, jobs: d.jobs, contractor: d.contractor, openJobs: d.openJobs, earn: d.earnStats, earnFailed: d.earnStatsFailed });
  const nav = contractorNav(navCounts(d));
  // Calendar only exists while a job has a booked time (web visibleNav); otherwise the list.
  const showCalendar = nav.calendar && mode === "calendar";
  const live = liveJobsOf(d.jobs);
  const active = live.find((j) => j.id === activeId) ?? live[0] ?? null;
  const others = d.jobs.filter((j) => j.id !== active?.id);
  const payoutsOff = !d.contractor?.stripe_payouts_enabled;

  return (
    <Screen edges={["left", "right"]} contentStyle={{ paddingHorizontal: 0 }} onRefresh={async () => { await Promise.all([reload(), convs.refresh(), bid.refresh()]); }}>
      <Pass>
        <PassTop />
        {/* Live jobs only, no "+ NEW": a contractor doesn't create jobs (web). Hidden under two. */}
        <View style={{ marginTop: t.s4 }}>
          <JobSwitcher jobs={live.map((j) => ({ id: j.id, label: j.request?.service_needed ?? "Job", state: jobHasRow(rows, j.id) ? "turn" : "wait" }))}
            activeId={active?.id} onSelect={setActiveId} />
        </View>
        <StateLine state={pass.state}>{pass.label}</StateLine>
        <Hero>{pass.hero}</Hero>
        {pass.sub ? <HeroSub>{pass.sub}</HeroSub> : null}
        {pass.meta.length > 0 ? (
          <PassMeta>{pass.meta.map((m) => <PassMetaItem key={m.label} label={m.label} value={m.value} accent={m.accent} />)}</PassMeta>
        ) : null}
      </Pass>

      <View style={{ paddingHorizontal: t.s4 }}>
        {/* max 4, not the kit's default 3: the contractor's extra slot is load-bearing (web :2262). */}
        <AttentionCard max={4}>
          {rows.map((a) => (
            <Row key={a.key} icon={a.icon} tone={a.tone} title={a.text} sub={a.cta} chevron onPress={() => goToRow(a)} accessibilityLabel={a.text + " " + a.cta} />
          ))}
        </AttentionCard>

        {/* The pass's "ONE STEP LEFT" has no attention row when nothing is won yet: give it its way there. */}
        {payoutsOff && rows.length === 0 && d.contractor?.status === "active" ? (
          <Card style={{ marginTop: t.s5 }}>
            <Row icon="dollar" tone="neutral" title="Connect your payouts on freddyfixit.ca" sub="Payout setup comes to the app in an upcoming update." chevron onPress={() => openOnWeb("/contractor-dashboard")} />
          </Card>
        ) : null}

        {nav.calendar ? (
          <View style={{ marginTop: t.s5 }}>
            <Segmented label="Jobs view" value={showCalendar ? "calendar" : "list"} onChange={setMode}
              options={[{ value: "list", label: "List" }, { value: "calendar", label: "Calendar" }]} />
          </View>
        ) : null}

        {showCalendar ? <CalendarView jobs={d.jobs} onOpen={openJob} /> : d.jobs.length === 0 ? (
          <Card style={{ marginTop: t.s5 }}>
            <Row icon="clipboard-list" tone="neutral" title="No jobs yet" sub="Jobs you win show up here. Open requests matching your trades are under Available." chevron onPress={() => router.push("/contractor/available")} />
          </Card>
        ) : (
          <>
            {active ? <JobCard job={active} hasRow={jobHasRow(rows, active.id)} /> : null}
            {others.length > 0 ? (
              <Group label={active ? "Your other jobs" : "Your jobs"}>
                <Card>
                  {others.map((j) => (
                    <Row key={j.id} icon="briefcase" tone="neutral"
                      title={(j.request?.service_needed ?? "Job") + (j.client?.first_name ? " · " + j.client.first_name : "")}
                      sub={jobStatusLabel(j) + (j.scheduled_at ? " · " + formatWhen(j.scheduled_at) : "")}
                      chevron onPress={() => openJob(j.id)} />
                  ))}
                </Card>
              </Group>
            ) : null}
          </>
        )}
        {nav.reviews ? (
          <Group label="More">
            <Card>
              <Row icon="star" tone="neutral" title="Reviews" sub={d.reviewsFailed ? "Couldn't load: tap to try again" : String(d.reviews.length)} chevron onPress={() => router.push("/contractor/reviews")} />
            </Card>
          </Group>
        ) : null}
      </View>
    </Screen>
  );
}

/** web's job card header (:2390): service, job code, client, destination, status, price. */
function JobCard({ job, hasRow }: { job: any; hasRow: boolean }) {
  const dest = jobDestination(job);
  return (
    <Group label="This job" action={<Pill tone={hasRow ? "accent" : "neutral"}>{jobStatusLabel(job)}</Pill>}>
      <Card>
        <Row icon="briefcase" tone="neutral" title={job.request?.service_needed ?? "Job"} sub={jobCode(job.id)} amount={job.amount ? "$" + job.amount : undefined} />
        <Row icon="user" tone="neutral" title={job.client?.first_name || "Your client"} sub={job.scheduled_at ? formatWhen(job.scheduled_at) : "No time booked yet"} />
        {dest.text ? <Row icon="map-pin" tone="neutral" title={dest.text + (dest.exact ? "" : " (approx.)")} /> : null}
        <Row icon="clipboard-list" tone="neutral" title="Open job" sub="Agreement, time & price, photos, tools" chevron onPress={() => openJob(job.id)} />
      </Card>
    </Group>
  );
}
