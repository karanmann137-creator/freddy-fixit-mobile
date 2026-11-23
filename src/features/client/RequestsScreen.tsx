// Requests tab (PLAN step 4.2): the pass, "needs your attention", the request
// switcher and the active request's card. Port of the top of web ClientDashboard.
//
// Every read here has three outcomes. A failed read renders "couldn't load" with a
// retry, never a confident zero (web: `jobLoadFailed`, `pickBid` re-opening it).
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import {
  AttentionCard, Button, Card, DeadEnd, Group, Hero, HeroSub, Ic, IconButton, JobSwitcher, Pass, PassMeta, PassMetaItem, PassTop,
  Pill, Row, Screen, SkRow, StateLine, Txt, rgba, useDelayed, useTheme,
} from "@/kit";
import { supabase } from "@/lib/supabase";
import { peekReferralError } from "@/lib/referralCode";
import { tidyDescription } from "@/lib/jobText";
import { useClientData } from "./data";
import {
  attentionRows, formatWhen, jobNeedsWeb, passFor, pickActiveRequest, requestDot,
  type AttnRow, type JobView, type Read,
} from "./rules";
import { openOnWeb } from "./web";
import { useUnreadCount } from "./NotificationsScreen";

const STATUS: Record<string, { label: string; tone: "accent" | "good" | "warn" | "danger" | "neutral" }> = {
  pending: { label: "Out to pros", tone: "neutral" },
  matched: { label: "Pro picked", tone: "neutral" },
  completed: { label: "Done", tone: "good" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

type ActiveReads = { job: Read<JobView>; bids: Read<number> };

/** One request's job, its pro's first name and its open-estimate count. Never throws. */
async function readActive(reqId: string | null, reqStatus: string | null, assignee: string | null): Promise<ActiveReads> {
  if (!reqId) return { job: { kind: "ok", value: { job: null, proName: null } }, bids: { kind: "ok", value: 0 } };
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
    return {
      job: j.error ? { kind: "error" } : { kind: "ok", value: { job: j.data ?? null, proName } },
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

  const data = state.kind === "ok" ? state.data : null;
  const req = data ? pickActiveRequest(data.requests, selectedId) : null;
  const reqId: string | null = req?.id ?? null;
  const reqStatus: string | null = req?.status ?? null;
  const assignee: string | null = req?.assigned_contractor_id ?? null;

  // Reads for the active request, keyed on the request (and a retry counter). A
  // result is only shown under the key it was read for, so switching requests
  // can't paint one request's job onto another, and a new key reads as "loading".
  const key = `${reqId}|${reqStatus}|${assignee}|${nonce}`;
  useEffect(() => {
    let stale = false;
    void readActive(reqId, reqStatus, assignee).then((r) => { if (!stale) setActive({ key, ...r }); });
    return () => { stale = true; };
  }, [key, reqId, reqStatus, assignee]);
  const job: Read<JobView> = active?.key === key ? active.job : { kind: "loading" };
  const bids: Read<number> = active?.key === key ? active.bids : { kind: "loading" };
  const retryActive = () => setNonce((n) => n + 1);

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

  const rows = attentionRows({ req, job, bids, refError });
  const pass = passFor({ req, job, bids, rows });
  const jv = job.kind === "ok" ? job.value : null;

  const act = (r: AttnRow) => {
    // Estimates (4.5) and adding a photo to a posted request are next in Phase 4;
    // until then the website does them, and works from any device.
    if (r.action === "estimates" || r.action === "photo") return openOnWeb("/client-dashboard");
    if (r.action === "settings") return router.push("/client/account");
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
          <RequestCard req={req} job={job} bids={bids} onRetry={retryActive} />
        )}

        {/* Every "ON THE WEBSITE" pass gets a way there: a live job, or a request
            stage the app can't read yet (review G4a #3). */}
        {pass.label === "ON THE WEBSITE" ? (
          <Group label={jv?.job && jobNeedsWeb(jv.job) ? "This job" : "This request"}>
            <Card>
              {jv?.job && jobNeedsWeb(jv.job) ? (
                <Row icon="briefcase" tone="neutral" title={(jv.proName || "Your pro") + (jv.job.scheduled_at ? " · " + formatWhen(jv.job.scheduled_at) : "")}
                  sub="Open the job on freddyfixit.ca to sign, pay, message or confirm. Job screens come to the app next." chevron
                  onPress={() => openOnWeb("/client-dashboard")} />
              ) : (
                <Row icon="briefcase" tone="neutral" title="Open this request on freddyfixit.ca" sub="The website shows every stage." chevron
                  onPress={() => openOnWeb("/client-dashboard")} />
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

function RequestCard({ req, job, bids, onRetry }: { req: any; job: Read<JobView>; bids: Read<number>; onRetry: () => void }) {
  const { t } = useTheme();
  const st = STATUS[req.status] ?? { label: String(req.status ?? "—"), tone: "neutral" as const };
  const failed = job.kind === "error" || (req.status === "pending" && bids.kind === "error");
  return (
    <Group label="Request" action={<Pill tone={st.tone}>{st.label}</Pill>}>
      <Card>
        <Row icon="wrench" tone="neutral" title={req.service_needed ?? "Request"} sub={req.preferred_schedule ?? undefined} />
        {req.location ? <Row icon="map-pin" tone="neutral" title={req.location} /> : null}
        {/* Display-time tidy only (web JobDescription): spacing/case/full stops, never a reworded word. */}
        {tidyDescription(req.job_description).length > 0 ? (
          <View style={{ paddingHorizontal: t.s4, paddingVertical: t.s3, gap: t.s2 }}>
            {tidyDescription(req.job_description).map((p, i) => <Txt key={i} size={0.9} lh={1.55} color={rgba(t.fg, 0.9)}>{p}</Txt>)}
          </View>
        ) : null}
        {req.status === "pending" && bids.kind === "ok" ? (
          <Row icon="user-check" tone="neutral" title={bids.value === 0 ? "No estimates yet" : bids.value + (bids.value === 1 ? " estimate" : " estimates") + " in"}
            sub={bids.value === 0 ? "Estimates usually land within a day." : undefined} />
        ) : null}
        {failed ? (
          <Row icon="alert-triangle" tone="warn" title="We couldn't load everything for this request." sub="Tap to try again." onPress={onRetry} />
        ) : null}
      </Card>
    </Group>
  );
}
