// Request detail (PLAN step 4.5): the request, its open estimates, pick a pro and
// remove the request. Port of the estimates block, `pickBid`, `removeRequest` and
// `QuoteBreakdownView` in web ClientDashboard.tsx.
//
// READS. The request comes from the client's own list (ClientDataProvider reads
// client_requests WHERE user_id = me), so "is this mine" is the id filter, never
// an RLS-visible row. The job and the bids are read here exactly as web reads
// them: the newest non-cancelled job for the request, and the request's PENDING
// bids, only while the request is pending, cheapest first. Then the pros'
// directory row, response speed and match score, which are decoration: a failed
// decoration read drops the badge, never the estimate (web ignores those errors).
//
// ⚠️ A FAILED BIDS READ IS NOT "NO ESTIMATES" (web `bidsFailed`). The Choose
// buttons are the only way forward from here, so a silent zero would stall the
// pick with no error anywhere. It says "couldn't load" and offers a retry.
//
// PICK = `accept_bid`, after the same confirm, with the server's reason on a
// refusal. On success the client's data is re-read and the Requests tab shows the
// job (its own job read has the failed-read handling web's `jobLoadFailed` adds).
//
// REMOVE = `remove_client_request`, offered only where `canRemoveRequest(req, job)`
// says it can succeed. A job read that FAILED hides the button: canRemoveRequest
// reads a null job as "no job", which is only true when we know it.
//
// MONEY: nothing is computed. Every amount on screen is a bid column, shown as the
// pro entered it. Choosing charges nothing; the agreement and payment are the job
// screen (4.7).
import React, { useCallback, useEffect, useState } from "react";
import { Image, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  Button, ButtonRow, Card, DashCard, DeadEnd, Group, Ic, Pill, Row, Screen, ScreenHeader, SkRow, Txt,
  askConfirm, notify, rgba, ui, useDelayed, useTheme, type PillTone,
} from "@/kit";
import { supabase } from "@/lib/supabase";
import { tidyDescription } from "@/lib/jobText";
import { canRemoveRequest } from "@/lib/jobRules";
import { respText } from "@/lib/respTime";
import { gradeLabel, type Grade } from "@/lib/servicePricing";
import type { Database } from "@/lib/database.types";
import { useClientData } from "./data";
import { STATUS } from "./RequestsScreen";
import type { Read } from "./rules";
import { openOnWeb } from "./web";

type Bid = Database["public"]["Tables"]["bids"]["Row"];
type Pro = { name: string; photo: string | null; grade: Grade | null; id: boolean; ins: boolean; wcb: boolean };
type Match = { score: number | null; rating: number | null; rating_count: number | null; total_jobs: number | null; area_match: boolean | null };
type Estimates = { bids: Bid[]; pros: Record<string, Pro>; resp: Record<string, number>; match: Record<string, Match> };
type Loaded = { key: string; job: Read<any | null>; est: Read<Estimates> };

const GRADE_TONE: Record<string, PillTone> = { "A+": "good", A: "neutral", "A-": "warn" }; // same as the pro profile

/** The pros' directory row, response speed and match score. Never throws; a failure is an empty map. */
async function decorate(reqId: string, ids: string[]): Promise<Omit<Estimates, "bids">> {
  const out: Omit<Estimates, "bids"> = { pros: {}, resp: {}, match: {} };
  try {
    const [dir, rs, ms] = await Promise.all([
      supabase.rpc("get_contractor_directory").select("id, first_name, last_name, price_grade, photo_url, id_verified, insurance_on_file, wcb_on_file").in("id", ids),
      supabase.rpc("contractor_response_stats", { p_ids: ids }),
      supabase.rpc("get_match_scores", { p_request_id: reqId }),
    ]);
    for (const c of (dir.data ?? []) as any[]) {
      out.pros[c.id] = {
        name: ((c.first_name ?? "") + " " + (c.last_name ? c.last_name[0] + "." : "")).trim() || "Contractor",
        photo: c.photo_url || null, grade: (c.price_grade || null) as Grade | null,
        id: !!c.id_verified, ins: !!c.insurance_on_file, wcb: !!c.wcb_on_file,
      };
    }
    for (const r of rs.data ?? []) out.resp[r.contractor_id] = Number(r.median_minutes);
    for (const m of ms.data ?? []) out.match[m.contractor_id] = m;
  } catch { /* decoration only: the estimates still render, just without badges */ }
  return out;
}

async function load(reqId: string, pending: boolean): Promise<Omit<Loaded, "key">> {
  try {
    const [j, b] = await Promise.all([
      supabase.from("jobs").select("*").eq("request_id", reqId).neq("status", "cancelled")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      // Estimates are only read for an open request, as on web.
      pending
        ? supabase.from("bids").select("*").eq("request_id", reqId).eq("status", "pending").order("amount", { ascending: true })
        : Promise.resolve({ data: [] as Bid[], error: null }),
    ]);
    const job: Read<any | null> = j.error ? { kind: "error" } : { kind: "ok", value: j.data ?? null };
    if (b.error) return { job, est: { kind: "error" } };
    const bids = (b.data ?? []) as Bid[];
    const ids = Array.from(new Set(bids.map((x) => x.contractor_id)));
    const deco = ids.length ? await decorate(reqId, ids) : { pros: {}, resp: {}, match: {} };
    return { job, est: { kind: "ok", value: { bids, ...deco } } };
  } catch {
    return { job: { kind: "error" }, est: { kind: "error" } };
  }
}

/** Web's order: best match first, then cheapest. */
function sortBids(bids: Bid[], match: Record<string, Match>): Bid[] {
  return [...bids].sort((a, b) =>
    (Number(match[b.contractor_id]?.score ?? -1)) - (Number(match[a.contractor_id]?.score ?? -1)) ||
    (Number(a.amount ?? Infinity)) - (Number(b.amount ?? Infinity)));
}

/** The headline number, as the pro entered it: a firm amount, else their range. */
function priceText(b: Bid): string | null {
  if (b.amount != null) return "$" + b.amount;
  if (b.price_low != null && b.price_high != null) return "$" + b.price_low + "–$" + b.price_high;
  return null;
}

const PICK_CONFIRM = {
  title: "Choose this contractor?",
  message: "This assigns your job to this contractor and declines the other bids. They'll be notified and will propose a time and price.",
  confirmLabel: "Yes, choose them",
  danger: false,
};

function removeConfirm(assigned: boolean) {
  return {
    title: assigned ? "Cancel this request?" : "Delete this request?",
    message: assigned
      ? "A contractor is attached, so the request is cancelled and kept in your history. If you've already paid, this won't work: your money is being held securely. Message your pro or email hello@freddyfixit.ca and we'll sort out the refund."
      : "This deletes the request permanently, along with any estimates on it. This can't be undone.",
    confirmLabel: assigned ? "Yes, cancel it" : "Yes, delete it",
    danger: true,
  };
}

export function RequestDetailScreen() {
  const { t } = useTheme();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const { state, reload } = useClientData();
  const [leaving, setLeaving] = useState(false);
  const showSkeleton = useDelayed();

  const data = state.kind === "ok" ? state.data : state.kind === "error" ? state.last : null;
  const back = <Button onPress={() => router.replace("/client")}>Back to my requests</Button>;

  // Once a pick or delete has succeeded the screen is on its way out: the re-read
  // changes (or removes) the request underneath it, and that must not flash "not found".
  if (leaving) return <Screen><ScreenHeader title="Your request" /></Screen>;
  if (state.kind === "error" && !data) {
    return <DeadEnd msg="We couldn't load this request. Check your connection, then try again." onRetry={() => void reload()} alt={back} />;
  }
  if (!data) {
    return (
      <Screen>
        <ScreenHeader title="Your request" />
        {showSkeleton ? <View style={{ paddingTop: t.s6, gap: t.s4 }}><SkRow /><SkRow /><SkRow /></View> : null}
      </Screen>
    );
  }
  const req = data.requests.find((r) => r.id === id) ?? null;
  if (!req) {
    // Only a SUCCESSFUL read of my own requests can say "not mine / not there".
    if (state.kind === "error") return <DeadEnd msg="We couldn't load this request. Check your connection, then try again." onRetry={() => void reload()} alt={back} />;
    return <DeadEnd msg="We couldn't find this request. It may have been deleted." retry={false} alt={back} />;
  }
  return <RequestBody key={req.id} req={req} stale={state.kind === "error"} reload={reload} onLeave={() => setLeaving(true)} />;
}

type Busy = { kind: "pick"; id: string } | { kind: "remove" } | null;

function RequestBody({ req, stale, reload, onLeave }: { req: any; stale: boolean; reload: () => Promise<void>; onLeave: () => void }) {
  const { t } = useTheme();
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const showSkeleton = useDelayed();
  const pending = req.status === "pending";

  // Keyed read: a result only counts under the key it was read for.
  const key = `${req.id}|${req.status}|${nonce}`;
  useEffect(() => {
    let gone = false;
    void load(req.id, pending).then((r) => { if (!gone) setLoaded({ key, ...r }); });
    return () => { gone = true; };
  }, [key, req.id, pending]);
  const cur = loaded?.key === key ? loaded : null;
  const job: Read<any | null> = cur ? cur.job : { kind: "loading" };
  const est: Read<Estimates> = cur ? cur.est : { kind: "loading" };
  const retry = useCallback(() => setNonce((n) => n + 1), []);

  const pick = async (b: Bid, name: string) => {
    if (busy) return;
    if (!(await askConfirm(PICK_CONFIRM))) return;
    setBusy({ kind: "pick", id: b.id });
    let error: { message: string } | null = null;
    try {
      ({ error } = await supabase.rpc("accept_bid", { p_bid_id: b.id }));
    } catch {
      error = { message: "Check your connection and try again." };
    }
    if (error) { setBusy(null); notify("Couldn't select: " + error.message, "danger"); return; }
    notify(name + " is your pro. They'll be notified and will propose a time and price.", "good");
    onLeave();
    await reload();
    router.dismissTo("/client");
  };

  const remove = async () => {
    if (busy) return;
    const assigned = !!req.assigned_contractor_id;
    if (!(await askConfirm(removeConfirm(assigned)))) return;
    setBusy({ kind: "remove" });
    let res: { data: string | null; error: { message: string } | null };
    try {
      res = await supabase.rpc("remove_client_request", { p_request_id: req.id });
    } catch {
      res = { data: null, error: { message: "Check your connection and try again." } };
    }
    const { data, error } = res;
    if (error) { setBusy(null); notify("Couldn't remove request: " + error.message, "danger"); return; }
    notify(data === "deleted" ? "Request deleted." : "Request cancelled. It's kept in your history.", "good");
    onLeave();
    await reload();
    router.dismissTo("/client");
  };

  const st = STATUS[req.status] ?? { label: String(req.status ?? "—"), tone: "neutral" as const };
  const desc = tidyDescription(req.job_description);
  const ok = est.kind === "ok" ? est.value : null;
  const sorted = ok ? sortBids(ok.bids, ok.match) : [];
  const ranked = ok ? Object.keys(ok.match).length > 0 : false;

  return (
    <Screen onRefresh={async () => { setNonce((n) => n + 1); await reload(); }}>
      <ScreenHeader title="Your request" />

      {stale ? (
        <Card style={{ marginTop: t.s4 }}>
          <Row icon="alert-triangle" tone="warn" title="We couldn't refresh your requests." sub="What you see may be out of date. Pull down to try again." />
        </Card>
      ) : null}

      <Group label="Request" action={<Pill tone={st.tone}>{st.label}</Pill>}>
        <Card>
          <Row icon="wrench" tone="neutral" title={req.service_needed ?? "Request"} sub={req.preferred_schedule ?? undefined} />
          {req.location ? <Row icon="map-pin" tone="neutral" title={req.location} /> : null}
          {/* Display-time tidy only (web JobDescription): never a reworded word. */}
          {desc.length > 0 ? (
            <View style={{ paddingHorizontal: t.s4, paddingVertical: t.s3, gap: t.s2 }}>
              {desc.map((p, i) => <Txt key={i} size={0.9} lh={1.55} color={rgba(t.fg, 0.9)}>{p}</Txt>)}
            </View>
          ) : null}
          {job.kind === "error" ? (
            <Row icon="alert-triangle" tone="warn" title="We couldn't load the latest on this request." sub="Nothing has changed with your request. Tap to try again." onPress={retry} />
          ) : null}
        </Card>
      </Group>

      {pending ? (
        est.kind === "loading" ? (
          showSkeleton ? <View style={{ paddingTop: t.s6, gap: t.s4 }}><SkRow /><SkRow /></View> : null
        ) : est.kind === "error" ? (
          <Card style={{ marginTop: t.s6 }}>
            <Row icon="alert-triangle" tone="warn" title="We couldn't load your estimates just now."
              sub="This isn't the same as having none. Tap to try again: any estimates pros have sent will appear here." onPress={retry} />
          </Card>
        ) : sorted.length === 0 ? (
          <Card style={{ marginTop: t.s6 }}>
            <Row icon="clock" tone="neutral" title="No estimates yet" sub="Estimates usually land within a day. We'll email you when the first one arrives." />
          </Card>
        ) : (
          <Group label="Your estimates" action={<Txt variant="label" size={0.8} color={rgba(t.muted, 0.8)}>{sorted.length + " estimate" + (sorted.length === 1 ? "" : "s")}</Txt>}>
            <Txt size={0.85} lh={1.5} color={rgba(t.muted, 0.8)} style={{ marginBottom: t.s3 }}>
              {"For " + (req.service_needed ?? "your request") + ". Pick the pro you want: nothing is charged until you approve their price and sign the agreement."}
            </Txt>
            {ranked ? (
              <Txt size={0.78} lh={1.5} color={rgba(t.muted, 0.7)} style={{ marginBottom: t.s3 }}>
                Ranked by match quality: rating, jobs done, response speed and area fit.
              </Txt>
            ) : null}
            <View style={{ gap: t.s4 }}>
              {sorted.map((b, i) => (
                <BidCard key={b.id} b={b} est={ok!} best={i === 0 && sorted.length > 1 && ok!.match[b.contractor_id] != null}
                  // At most one orange call to action per screen: with several estimates
                  // no single Choose is "the" action, and none is pushed over the others.
                  primary={sorted.length === 1}
                  busy={busy} onPick={pick} />
              ))}
            </View>
          </Group>
        )
      ) : null}

      {/* Web shows Delete only where remove_client_request can succeed. A FAILED job
          read hides it: canRemoveRequest reads a null job as "there is no job". */}
      {job.kind === "ok" && canRemoveRequest(req, job.value) ? (
        <View style={{ marginTop: t.s8 }}>
          <Button variant="danger" full loading={busy?.kind === "remove"} disabled={!!busy} onPress={() => void remove()}>
            {req.assigned_contractor_id ? "Cancel request" : "Delete request"}
          </Button>
        </View>
      ) : null}
    </Screen>
  );
}

function BidCard({ b, est, best, primary, busy, onPick }: {
  b: Bid; est: Estimates; best: boolean; primary: boolean; busy: Busy; onPick: (b: Bid, name: string) => void;
}) {
  const { t } = useTheme();
  const pro = est.pros[b.contractor_id];
  const name = pro?.name ?? "Contractor";
  const m = est.match[b.contractor_id];
  const resp = est.resp[b.contractor_id];
  const price = priceText(b);
  const bits: string[] = [];
  if (m) {
    if (m.rating != null && Number(m.rating_count) > 0) bits.push("★ " + Number(m.rating).toFixed(1) + "/10 (" + m.rating_count + ")");
    if (Number(m.total_jobs) > 0) bits.push(m.total_jobs + " job" + (Number(m.total_jobs) === 1 ? "" : "s") + " done");
    if (m.area_match) bits.push("works your area");
  }
  const initials = name.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
  const range = b.price_low != null && b.price_high != null ? "$" + b.price_low + "–$" + b.price_high : null;

  return (
    <DashCard>
      <View style={{ flexDirection: "row", gap: t.s3, alignItems: "flex-start" }}>
        {/* Who you'd be letting into your home: initials when there's no photo. */}
        <View style={{ width: t.hCtl, height: t.hCtl, borderRadius: ui.pill, overflow: "hidden", backgroundColor: t.accentSoft, alignItems: "center", justifyContent: "center" }}>
          {pro?.photo
            ? <Image source={{ uri: pro.photo }} accessibilityLabel={name} style={{ width: "100%", height: "100%" }} />
            : <Txt variant="label" size={0.9} color={t.text}>{initials}</Txt>}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: t.s2 }}>
          <Txt variant="bodyBold">{name}</Txt>
          {price ? <Txt variant="label" size={1.2} color={t.text}>{price}</Txt> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2 }}>
            {best ? <Pill>Best match</Pill> : null}
            {pro?.grade ? <Pill tone={GRADE_TONE[pro.grade] ?? "neutral"}>{`${pro.grade} · ${gradeLabel(pro.grade, "pro")}`}</Pill> : null}
            {resp != null && Number.isFinite(resp) ? <Pill tone="good">{"Usually responds in " + respText(resp)}</Pill> : null}
            {/* "Verified" only where a third party checked; "on file" means we hold it (web VerifiedMarks). */}
            {pro?.id ? <Pill tone="good">ID verified</Pill> : null}
            {pro?.ins ? <Pill>Insured</Pill> : null}
            {pro?.wcb ? <Pill>WCB</Pill> : null}
            {b.walkthrough_requested ? <Pill>Wants a free walkthrough first</Pill> : null}
          </View>
          {bits.length > 0 ? <Txt size={0.78} color={rgba(t.muted, 0.7)}>{bits.join(" · ")}</Txt> : null}
          {b.walkthrough_requested ? (
            <Txt size={0.82} lh={1.45} color={rgba(t.muted, 0.75)}>
              {"This pro prefers to see the space before giving a firm price" + (range ? ", ballpark " + range : "") + ". If you choose them, they'll propose a quick free visit, then send your estimate."}
            </Txt>
          ) : null}
          {b.message ? <Txt size={0.86} lh={1.5} color={rgba(t.muted, 0.85)}>{b.message}</Txt> : null}
          {!b.walkthrough_requested ? <QuoteBreakdown b={b} /> : null}
        </View>
      </View>
      <View style={{ marginTop: t.s4 }}>
        <Button variant={primary ? "primary" : "secondary"} full accessibilityLabel={`Choose ${name}`}
          loading={busy?.kind === "pick" && busy.id === b.id} disabled={!!busy} onPress={() => onPick(b, name)}>
          Choose
        </Button>
      </View>
      <ButtonRow>
        <Button variant="ghost" full onPress={() => router.push({ pathname: "/pro/[id]", params: { id: b.contractor_id } })}>Profile</Button>
        {/* Bid-stage chat is step 4.11; until it lands the website has it. */}
        <Button variant="ghost" full accessibilityLabel={`Ask ${name} a question on the website`} onPress={() => openOnWeb("/client-dashboard")}>Ask a question</Button>
      </ButtonRow>
    </DashCard>
  );
}

/** Port of web QuoteBreakdownView: the bid's own columns, formatted, never summed. */
function QuoteBreakdown({ b }: { b: Bid }) {
  const { t } = useTheme();
  const items: [string, number | null][] = [["Labour", b.labour_amount], ["Parts & materials", b.parts_amount], ["Call-out", b.callout_fee]];
  const present = items.filter(([, v]) => v != null) as [string, number][];
  const hasRange = b.price_low != null && b.price_high != null;
  if (present.length === 0 && !b.assumptions && !b.subject_to_inspection && !hasRange) return null;
  return (
    <View style={{ marginTop: t.s1, padding: t.s3, gap: t.s1, borderRadius: t.r2, backgroundColor: rgba(t.fg, 0.04), borderWidth: t.hairW, borderColor: rgba(t.fg, 0.08) }}>
      {present.length > 0 ? <Txt variant="label" size={0.72} color={rgba(t.muted, 0.6)}>Price breakdown</Txt> : null}
      {present.map(([l, v]) => (
        <View key={l} style={{ flexDirection: "row", justifyContent: "space-between", gap: t.s2 }}>
          <Txt size={0.82} color={rgba(t.muted, 0.85)}>{l}</Txt>
          <Txt size={0.82} color={rgba(t.muted, 0.85)}>{"$" + Number(v).toFixed(2)}</Txt>
        </View>
      ))}
      {hasRange ? <Txt variant="bodyBold" size={0.82}>{"Estimated range: $" + Number(b.price_low).toFixed(0) + "–$" + Number(b.price_high).toFixed(0)}</Txt> : null}
      {b.assumptions ? <Txt size={0.78} lh={1.45} color={rgba(t.muted, 0.7)}>{b.assumptions}</Txt> : null}
      {b.subject_to_inspection ? (
        <View style={{ flexDirection: "row", gap: t.s2, alignItems: "flex-start" }}>
          <Ic name="alert-triangle" size={ui.icon.sm} color={t.warn} />
          <Txt size={0.78} lh={1.4} color={t.warn} style={{ flex: 1 }}>Heads up: the final price may change after the contractor inspects the job on-site.</Txt>
        </View>
      ) : null}
    </View>
  );
}
