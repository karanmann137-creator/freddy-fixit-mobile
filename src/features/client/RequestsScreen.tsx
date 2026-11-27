// Requests tab (PLAN step 4.2): the pass, "needs your attention", the request
// switcher and the active request's card. Port of the top of web ClientDashboard.
//
// Every read here has three outcomes. A failed read renders "couldn't load" with a
// retry, never a confident zero (web: `jobLoadFailed`, `pickBid` re-opening it).
import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  AttentionCard, Button, Card, DeadEnd, Group, Hero, HeroSub, Ic, IconButton, JobSwitcher, Pass, PassMeta, PassMetaItem, PassTop,
  Pill, Row, Screen, SkRow, StateLine, Txt, rgba, useDelayed, useTheme,
} from "@/kit";
import { supabase } from "@/lib/supabase";
import { peekReferralError } from "@/lib/referralCode";
import { tidyDescription } from "@/lib/jobText";
import { useClientData } from "./data";
import {
  attentionRows, formatWhen, isPastRequest, jobOnWebOnly, passFor, pickActiveRequest, requestDot,
  type AttnRow, type JobView, type Read,
} from "./rules";
import { openOnWeb, webJobPath } from "./web";
import { getFeeRate } from "@/lib/platformRates";
import { readJobExtras } from "@/features/job/reads";
import { useReleaseNote } from "@/features/job/releaseNotes";
import { useUnreadCount } from "./NotificationsScreen";

export const STATUS: Record<string, { label: string; tone: "accent" | "good" | "warn" | "danger" | "neutral" }> = {
  pending: { label: "Out to pros", tone: "neutral" },
  matched: { label: "Pro picked", tone: "neutral" },
  completed: { label: "Done", tone: "good" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

type ActiveReads = { job: Read<JobView>; bids: Read<number> };

/** One request's job, its pro's first name and its open-estimate count. Never throws. */
async function readActive(reqId: string | null, reqStatus: string | null, assignee: string | null): Promise<ActiveReads> {
  const none = { gate: { kind: "ok" as const, signed: false, status: null }, repostBlock: undefined };
  if (!reqId) return { job: { kind: "ok", value: { job: null, proName: null, extras: none } }, bids: { kind: "ok", value: 0 } };
  try {
    const [j, pro, b] = await Promise.all([
      supabase.from("jobs").select("*").eq("request_id", reqId).neq("status", "cancelled")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      assignee ? supabase.rpc("get_contractor_profile", { p_id: assignee }).maybeSingle() : Promise.resolve({ data: null, error: null }),
      // Estimates are only read for an open request, as on web.
      reqStatus === "pending"
        ? supabase.from("bids").select("id", { count: "exact", head: true }).eq("request_id", reqId).eq("status", "pending")
        : Promise.resolve({ count: 0, error: null }),
    ]);
    // The pro's name is decoration: a failed read drops the name, never the job.
    const proName = !pro.error && pro.data ? ((pro.data as { first_name?: string | null }).first_name ?? null) : null;
    // The agreement gate and the re-post answer arrive WITH the job, so no attention
    // row is derived from a job whose gate hasn't been read (it would flash "sign it").
    const extras = !j.error && j.data ? await readJobExtras(j.data) : none;
    return {
      job: j.error ? { kind: "error" } : { kind: "ok", value: { job: j.data ?? null, proName, extras } },
      bids: b.error ? { kind: "error" } : { kind: "ok", value: (b as { count?: number | null }).count ?? 0 },
    };
  } catch {
    return { job: { kind: "error" }, bids: { kind: "error" } };
  }
}

export function RequestsScreen() {
  const { t } = useTheme();
  const { state, reload } = useClientData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [active, setActive] = useState<(ActiveReads & { key: string }) | null>(null);
  const [nonce, setNonce] = useState(0);
  const [refError, setRefError] = useState("");
  const showSkeleton = useDelayed();
  const unread = useUnreadCount(state.kind === "ok" ? state.data.userId : null);
  // platform_fee_rate(), for the balance figure on an uncharged job only. Unknown = no figure, never a guess.
  const [feeRate, setFeeRate] = useState<number | null>(null);
  useEffect(() => { void getFeeRate().then((r) => setFeeRate(r.ok ? r.rate : null)).catch(() => setFeeRate(null)); }, []);

  const data = state.kind === "ok" ? state.data : null;
  const req = data ? pickActiveRequest(data.requests, selectedId) : null;
  const reqId: string | null = req?.id ?? null;
  const reqStatus: string | null = req?.status ?? null;
  const assignee: string | null = req?.assigned_contractor_id ?? null;

  // Reads for the active request, keyed on the request (and a retry counter). A
  // result is only shown under the key it was read for, so switching requests
  // can't paint one request's job onto another, and a new key reads as "loading".
  const key = `${reqId}|${reqStatus}|${assignee}|${nonce}`;
  // Coming back to the tab (from the job screen, where the client may have signed or
  // confirmed) re-reads under the SAME key: fresh rows, no "loading" flash.
  const [focusTick, setFocusTick] = useState(0);
  useFocusEffect(useCallback(() => { setFocusTick((n) => n + 1); }, []));
  useEffect(() => {
    let stale = false;
    void readActive(reqId, reqStatus, assignee).then((r) => { if (!stale) setActive({ key, ...r }); });
    return () => { stale = true; };
  }, [key, reqId, reqStatus, assignee, focusTick]);
  const job: Read<JobView> = active?.key === key ? active.job : { kind: "loading" };
  const bids: Read<number> = active?.key === key ? active.bids : { kind: "loading" };
  const retryActive = () => setNonce((n) => n + 1);
  const releaseNote = useReleaseNote(job.kind === "ok" ? job.value.job?.id : null);

  useEffect(() => { void peekReferralError().then(setRefError).catch(() => setRefError("")); }, [data]);

  // A pull re-reads everything: the lists, and (via the retry counter) the job.
  const refreshAll = async () => { setNonce((n) => n + 1); await reload(); };

  if (state.kind === "error") {
    return <DeadEnd msg="We couldn't load your requests. Check your connection, then try again." onRetry={() => void reload()} />;
  }
  if (state.kind === "loading" || !data) {
    return (
      <Screen>
        {showSkeleton ? <View style={{ paddingTop: t.s6, gap: t.s4 }}><SkRow /><SkRow /><SkRow /></View> : null}
      </Screen>
    );
  }

  const rows = attentionRows({ req, job, bids, refError, releaseNote, feeRate });
  const pass = passFor({ req, job, bids, rows });
  const jv = job.kind === "ok" ? job.value : null;
  // Only a milestone job is still handed to the website (stage payments, step 4.9).
  const jobOnWeb = !!jv?.job && jobOnWebOnly(jv.job);

  const openRequest = (id: string) => router.push({ pathname: "/client/request/[id]", params: { id } });
  const act = (r: AttnRow) => {
    // Estimates open the request screen (4.5). Adding a photo to a posted request
    // is still the website's, which works from any device.
    if (r.action === "estimates" && req) return openRequest(req.id);
    if (r.action === "estimates" || r.action === "photo") return openOnWeb("/client-dashboard");
    if (r.action === "settings") return router.push("/client/account");
    // A job-stage row lands on the job screen AT the control it names.
    if (r.action === "job" && r.jobId) return router.push({ pathname: "/client/job/[id]", params: { id: r.jobId, focus: r.anchor ?? "" } });
  };

  return (
    <Screen edges={["left", "right"]} contentStyle={{ paddingHorizontal: 0 }} onRefresh={refreshAll}>
      <Pass>
        <PassTop>
          <IconButton label="Notifications" badge={unread ? (unread > 9 ? "9+" : unread) : null} onPress={() => router.push("/client/notifications")}>
            <Ic name="bell" size={18} />
          </IconButton>
        </PassTop>
        <View style={{ marginTop: t.s4 }}><StateLine state={pass.state}>{pass.label}</StateLine></View>
        <Hero>{pass.hero}</Hero>
        {pass.sub ? <HeroSub>{pass.sub}</HeroSub> : null}
        {pass.meta.length > 0 ? (
          <PassMeta>
            {pass.meta.map((m) => <PassMetaItem key={m.label} label={m.label} value={m.value} accent={m.accent} />)}
          </PassMeta>
        ) : null}
      </Pass>

      <View style={{ paddingHorizontal: t.s4 }}>
        <AttentionCard max={3}>
          {rows.map((r) => (
            <Row key={r.key} icon={r.icon} tone={r.tone} title={r.text} sub={r.cta} chevron onPress={() => act(r)} accessibilityLabel={`${r.text} ${r.cta}`} />
          ))}
        </AttentionCard>

        <View style={{ marginTop: t.s5 }}>
          <JobSwitcher
            alwaysShow={data.requests.length > 0}
            jobs={data.requests.map((r) => ({ id: r.id, label: r.service_needed ?? "Request", state: requestDot(r) }))}
            activeId={req?.id}
            onSelect={setSelectedId}
            onNew={() => router.push("/client/new-request")}
          />
        </View>

        {!req ? (
          <Card>
            <Row icon="clipboard-list" tone="neutral" title="No requests yet" sub="Tell us what needs fixing. Local pros send you estimates, and you pick." />
          </Card>
        ) : (
          <RequestCard req={req} job={job} bids={bids} onRetry={retryActive} onOpen={() => openRequest(req.id)} />
        )}

        {/* The job itself: every live job opens the job screen; a milestone job (4.9) and a
            request stage the app can't read yet still go to the website (review G4a #3). */}
        {jv?.job && !jobOnWeb ? (
          <Group label="This job">
            <Card>
              <Row icon="briefcase" tone="neutral" title={(jv.proName || "Your pro") + (jv.job.scheduled_at ? " · " + formatWhen(jv.job.scheduled_at) : "")}
                sub="Agreement, payment, photos and progress" chevron
                onPress={() => router.push({ pathname: "/client/job/[id]", params: { id: jv.job.id } })} />
            </Card>
          </Group>
        ) : jobOnWeb || pass.label === "ON THE WEBSITE" ? (
          <Group label={jobOnWeb ? "This job" : "This request"}>
            <Card>
              {jv?.job && jobOnWeb ? (
                <Row icon="briefcase" tone="neutral" title={(jv.proName || "Your pro") + (jv.job.scheduled_at ? " · " + formatWhen(jv.job.scheduled_at) : "")}
                  sub="This job is paid in stages: open it on freddyfixit.ca to fund, approve or message. Stage payments come to the app next." chevron
                  onPress={() => void openOnWeb(webJobPath(jv.job.id))} />
              ) : (
                <Row icon="briefcase" tone="neutral" title="Open this request on freddyfixit.ca" sub="The website shows every stage." chevron
                  onPress={() => void openOnWeb("/client-dashboard")} />
              )}
            </Card>
          </Group>
        ) : null}

        <View style={{ marginTop: t.s6 }}>
          <Button full onPress={() => router.push("/client/new-request")}>New request</Button>
        </View>
      </View>
    </Screen>
  );
}

function RequestCard({ req, job, bids, onRetry, onOpen }: { req: any; job: Read<JobView>; bids: Read<number>; onRetry: () => void; onOpen: () => void }) {
  const { t } = useTheme();
  const st = STATUS[req.status] ?? { label: String(req.status ?? "—"), tone: "neutral" as const };
  const failed = job.kind === "error" || (req.status === "pending" && bids.kind === "error");
  // The request screen (estimates, pick, delete) is for a request still in play.
  const open = !isPastRequest(req) ? onOpen : undefined;
  return (
    <Group label="Request" action={<Pill tone={st.tone}>{st.label}</Pill>}>
      <Card>
        <Row icon="wrench" tone="neutral" title={req.service_needed ?? "Request"} sub={req.preferred_schedule ?? undefined} chevron={!!open} onPress={open} />
        {req.location ? <Row icon="map-pin" tone="neutral" title={req.location} /> : null}
        {/* Display-time tidy only (web JobDescription): spacing/case/full stops, never a reworded word. */}
        {tidyDescription(req.job_description).length > 0 ? (
          <View style={{ paddingHorizontal: t.s4, paddingVertical: t.s3, gap: t.s2 }}>
            {tidyDescription(req.job_description).map((p, i) => <Txt key={i} size={0.9} lh={1.55} color={rgba(t.fg, 0.9)}>{p}</Txt>)}
          </View>
        ) : null}
        {req.status === "pending" && bids.kind === "ok" ? (
          <Row icon="user-check" tone="neutral" title={bids.value === 0 ? "No estimates yet" : bids.value + (bids.value === 1 ? " estimate" : " estimates") + " in"}
            sub={bids.value === 0 ? "Estimates usually land within a day." : "See them and pick a pro."} chevron onPress={onOpen} />
        ) : null}
        {failed ? (
          <Row icon="alert-triangle" tone="warn" title="We couldn't load everything for this request." sub="Tap to try again." onPress={onRetry} />
        ) : null}
      </Card>
    </Group>
  );
}
