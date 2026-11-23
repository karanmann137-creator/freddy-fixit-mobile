// One open job (PLAN step 5.5): the web Available card in full, its bid form,
// and "Not a fit — hide this job". Port of web ContractorAvailableTab.tsx plus
// ContractorDashboard.tsx `placeBid` / `hideJob` and shared.tsx `QuoteBreakdown`.
//
// SUBMIT: the same `place_bid` RPC with the same twelve arguments, web's checks
// in web's order with web's words (bid.ts `buildBid`), then the terms gate LAST,
// as on web. A refusal shows the server's own sentence (`error.message` of the
// RPC: place_bid raises readable reasons such as "This job already has the maximum
// of 7 bids"). No fee, commission or take-home is shown: web shows none here.
//
// HIDE: the same `hidden_jobs` insert after the same confirm. list_open_jobs
// excludes hidden rows server-side, so the re-read drops it.
//
// The row comes from the Available list (useContractorData().openJobs); there is
// no single-job read of list_open_jobs. A failed list read is "couldn't load".
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import {
  Button, Card, DeadEnd, Field, FormNote, Group, Ic, Row, Screen, ScreenHeader, SkRow, Txt,
  askConfirm, notify, rgba, ui, useDelayed, useTheme,
} from "@/kit";
import { supabase } from "@/lib/supabase";
import { ensureTermsAccepted } from "@/lib/terms";
import { TARGET_BID_DISCOUNT, money, useServicePricing, type ServicePrice } from "@/lib/servicePricing";
import { openOnWeb } from "@/features/client/web";
import { Label, LinkButton, Note, Tick } from "@/features/request/pieces";
import { useContractorData } from "./data";
import {
  BID_CAP_SHOWN, buildBid, hasMyBid, moneyInput, myBidSummary, priceFor, seedForm, suggestedBid,
  type BidForm, type OpenJob,
} from "./bid";
import { BidCount, BudgetBox, JobBadges, JobHead, JobPhotoQuote, JobText } from "./OpenJobParts";

export function OpenJobScreen({ id }: { id: string }) {
  const { t } = useTheme();
  const { state, reload } = useContractorData();
  const showSkeleton = useDelayed();
  if (state.kind === "error") {
    return <DeadEnd msg="We couldn't load this job. Check your connection, then try again." onRetry={() => void reload()} />;
  }
  if (state.kind === "loading") {
    return (
      <Screen>
        <ScreenHeader title="Open job" />
        {showSkeleton ? <View style={{ paddingTop: t.s4, gap: t.s4 }}><SkRow /><SkRow /></View> : null}
      </Screen>
    );
  }
  const r = (state.data.openJobs as OpenJob[]).find((x) => x.id === id);
  if (!r) {
    // Picked, closed, hidden, or past the server's freshness window: the list
    // read succeeded and this job isn't in it. Re-checking is honest; so is a way back.
    return (
      <DeadEnd msg="This job isn't open to you any more. It may have been picked, closed or hidden."
        retryLabel="Check again" onRetry={() => void reload()}
        alt={<Button variant="ghost" onPress={() => router.replace("/contractor/available")}>Back to Available</Button>} />
    );
  }
  return <OpenJobBody key={r.id} r={r} userId={state.data.userId} minCallout={state.data.contractor?.min_callout ?? null} reload={reload} />;
}

type Thread = { unread: number } | null;
type ThreadRead = { key: string; kind: "ok"; value: Thread } | { key: string; kind: "error" };

function OpenJobBody({ r, userId, minCallout, reload }: { r: OpenJob; userId: string; minCallout: number | null; reload: () => Promise<void> }) {
  const { t } = useTheme();
  const pricing = useServicePricing();
  const mine = hasMyBid(r);
  const full = (r.bid_count ?? 0) >= BID_CAP_SHOWN;
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<BidForm>(() => seedForm(r));
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [hiding, setHiding] = useState(false);
  const [hideError, setHideError] = useState("");
  const patch = (p: Partial<BidForm>) => { setF((prev) => ({ ...prev, ...p })); setFormError(""); };

  // The bid-stage thread for this request, if the client has opened one (web
  // `bid.byRequest[r.id]`). Bid chat itself is step 4.11; until then the button
  // hands over to the website, which has it. Keyed, so a retry reads afresh.
  const [nonce, setNonce] = useState(0);
  const [thread, setThread] = useState<ThreadRead | null>(null);
  const key = `${r.id}|${nonce}`;
  useEffect(() => {
    let stale = false;
    Promise.resolve(supabase.rpc("my_bid_threads"))
      .then(({ data, error }) => {
        if (stale) return;
        if (error || !Array.isArray(data)) { setThread({ key, kind: "error" }); return; }
        const row = data.find((x) => x.request_id === r.id);
        setThread({ key, kind: "ok", value: row ? { unread: Number(row.unread ?? 0) } : null });
      })
      .catch(() => { if (!stale) setThread({ key, kind: "error" }); });
    return () => { stale = true; };
  }, [key, r.id]);
  const th = thread?.key === key ? thread : null;

  const showForm = mine ? editing : !full;

  const submit = async () => {
    if (busy) return;
    const built = buildBid(r, f);
    if ("error" in built) { setFormError(built.error); return; }
    // Terms gate LAST, after the form's own checks (web). A false means they saw
    // the sheet and declined: abandon quietly. It fails open (terms.ts).
    // Busy from here, so a second tap during the terms read can't send the bid twice.
    setBusy(true);
    setFormError("");
    if (!(await ensureTermsAccepted("bid"))) { setBusy(false); return; }
    const { error } = await supabase.rpc("place_bid", built.args);
    if (error) {
      setBusy(false);
      // The server's own reason (a readable RAISE in place_bid), as web shows it.
      setFormError("Couldn't place bid: " + error.message);
      return;
    }
    notify(mine ? "Your bid has been updated." : "Your bid has been placed.", "good");
    await reload();
    setBusy(false);
    setEditing(false);
  };

  const hide = async () => {
    if (hiding) return;
    if (!(await askConfirm({
      title: "Hide this job?",
      message: "It'll be removed from your Available Jobs list and you won't see this request again.",
      confirmLabel: "Hide it",
      danger: false,
    }))) return;
    setHiding(true);
    setHideError("");
    const { error } = await supabase.from("hidden_jobs").insert({ contractor_id: userId, request_id: r.id });
    if (error) { setHiding(false); setHideError("Couldn't hide this job: " + error.message); return; }
    router.back();
    void reload();
  };

  return (
    <Screen onRefresh={async () => { setNonce((n) => n + 1); await reload(); }}>
      <ScreenHeader title={r.service_needed ?? "Open job"} />
      <View style={{ gap: t.s4 }}>
        <JobBadges r={r} full />
        <JobHead r={r} pricing={pricing} />
        <BudgetBox r={r} pricing={pricing} />
        <JobText text={r.job_description} />
        <JobPhotoQuote r={r} />
      </View>

      <Group label="Bids" action={<BidCount r={r} />}>
        {mine && !editing ? (
          <Card>
            <Row icon="check-circle" tone="good" title="Your bid has been placed" sub={"Waiting on client confirmation · " + myBidSummary(r)} />
            <Row icon="pencil" tone="neutral" title="Edit bid" chevron
              onPress={() => { setF(seedForm(r)); setFormError(""); setEditing(true); }} />
            {/* Web's printable quote is a print-to-paper document; it stays on the website. */}
            <Row icon="download" tone="neutral" title="Printable quote" sub="Opens on freddyfixit.ca" chevron
              onPress={() => openOnWeb("/contractor-dashboard?tab=available")} />
          </Card>
        ) : null}

        {th?.kind === "ok" && th.value ? (
          <Card style={{ marginTop: t.s3 }}>
            <Row icon="message-square" tone={th.value.unread > 0 ? "accent" : "neutral"}
              title={th.value.unread > 0 ? "The client messaged you — reply (" + th.value.unread + " new)" : "Message the client"}
              sub="Opens on freddyfixit.ca for now" chevron onPress={() => openOnWeb("/contractor-dashboard?tab=messages")} />
          </Card>
        ) : th?.kind === "error" ? (
          <Card style={{ marginTop: t.s3 }}>
            <Row icon="alert-triangle" tone="warn" title="We couldn't check for messages from the client." sub="Tap to try again." onPress={() => setNonce((n) => n + 1)} />
          </Card>
        ) : null}

        {!mine && full ? (
          <Txt size={0.85} color={t.warn} style={{ marginTop: t.s2 }}>{"This job already has " + BID_CAP_SHOWN + " bids."}</Txt>
        ) : null}

        {showForm ? (
          <BidFormView r={r} f={f} patch={patch} pricing={pricing} minCallout={minCallout} />
        ) : null}
      </Group>

      {showForm ? (
        <>
          {formError ? <FormNote>{formError}</FormNote> : null}
          <View style={{ marginTop: t.s5, gap: t.s2 }}>
            <Button variant="primary" full loading={busy} onPress={() => void submit()} testID="place-bid">{mine ? "Update bid" : "Place bid"}</Button>
            {mine ? <Button variant="ghost" full disabled={busy} onPress={() => { setEditing(false); setFormError(""); }}>Cancel</Button> : null}
          </View>
        </>
      ) : null}

      <View style={{ marginTop: t.s6 }}>
        <LinkButton onPress={() => void hide()}>{hiding ? "Hiding…" : "Not a fit — hide this job"}</LinkButton>
        {hideError ? <FormNote>{hideError}</FormNote> : null}
      </View>
    </Screen>
  );
}

/** The bid form: web's walkthrough tick, price, message, QuoteBreakdown and assumptions, in web's order. */
function BidFormView({ r, f, patch, pricing, minCallout }: {
  r: OpenJob; f: BidForm; patch: (p: Partial<BidForm>) => void; pricing: Record<string, ServicePrice>; minCallout: number | null;
}) {
  const { t } = useTheme();
  const wtOn = !!f.walkthrough;
  return (
    <View>
      <Tick checked={wtOn} onChange={(v) => patch({ walkthrough: v })} label="I'd like to see the space first. Bid with a ballpark range instead of a firm price.">
        <Txt size={0.82} lh={1.45}>
          <Txt size={0.82} variant="bodyBold">{"I'd like to see the space first."}</Txt>
          {" Bid with a ballpark range instead of a firm price — if the client picks you, you'll book a free walkthrough, then send your exact estimate. Great for bigger or hard-to-price jobs. A range is still required: it's the only number the client can compare you on."}
        </Txt>
      </Tick>
      {wtOn ? (
        <View style={{ flexDirection: "row", gap: t.s3 }}>
          <View style={{ flex: 1 }}><Field label="Ballpark low $" keyboardType="decimal-pad" value={f.price_low ?? ""} onChangeText={(v) => patch({ price_low: moneyInput(v) })} /></View>
          <View style={{ flex: 1 }}><Field label="Ballpark high $" keyboardType="decimal-pad" value={f.price_high ?? ""} onChangeText={(v) => patch({ price_high: moneyInput(v) })} /></View>
        </View>
      ) : (
        <Field label="Price $" keyboardType="decimal-pad" value={f.amount} onChangeText={(v) => patch({ amount: moneyInput(v), used_base_price: false })} />
      )}
      <Field label="Short message (optional)" value={f.message} onChangeText={(v) => patch({ message: v })} />
      {!wtOn ? <QuoteBreakdown v={f} on={patch} calloutHint={minCallout} price={priceFor(pricing, r.service_needed)} target={suggestedBid(r, pricing)} /> : null}
      <Field label="Assumptions (optional)" placeholder="e.g. price assumes parts are accessible" value={f.assumptions ?? ""} onChangeText={(v) => patch({ assumptions: v })} />
    </View>
  );
}

/**
 * web shared.tsx `QuoteBreakdown`. The suggested bid and the base price only
 * PREFILL the amount when tapped; nothing validates against either. The
 * itemised total is the sum of what was typed (web's own line), not a fee.
 */
function QuoteBreakdown({ v, on, calloutHint, price, target }: {
  v: BidForm; on: (p: Partial<BidForm>) => void; calloutHint: number | null; price: ServicePrice | null; target: number | null;
}) {
  const { t } = useTheme();
  const keys: [keyof BidForm & ("labour" | "parts" | "callout"), string, string][] = [
    ["labour", "Labour", ""], ["parts", "Parts", ""], ["callout", "Call-out", calloutHint != null ? String(calloutHint) : ""],
  ];
  const any = (["labour", "parts", "callout"] as const).some((k) => v[k] !== "" && v[k] != null);
  const sum = (["labour", "parts", "callout"] as const).reduce((s, k) => s + (v[k] ? Number(v[k]) : 0), 0);
  const hasRef = !!price && (price.base_price != null || (price.typical_low != null && price.typical_high != null));
  const tgt = target != null && isFinite(Number(target)) && Number(target) > 0 ? Math.round(Number(target)) : null;
  const box = { marginTop: t.s4, padding: t.s3, gap: t.s2, borderRadius: t.r2, backgroundColor: rgba(t.fg, 0.04), borderWidth: t.hairW, borderColor: rgba(t.fg, 0.08) };
  return (
    <View>
      {tgt != null ? (
        <View style={box}>
          <Txt size={0.82}><Txt size={0.82} color={rgba(t.muted, 0.7)}>Suggested bid </Txt><Txt size={0.82} variant="bodyBold">{money(tgt)}</Txt></Txt>
          <Txt size={0.74} color={rgba(t.muted, 0.6)}>{Math.round(TARGET_BID_DISCOUNT * 100) + "% under the category average — a guide, not a limit."}</Txt>
          <Button onPress={() => on({ amount: String(tgt), labour: "", parts: "", callout: "", used_base_price: false })}>Use suggested</Button>
        </View>
      ) : null}
      {hasRef && price ? (
        <View style={box}>
          <Txt size={0.78} color={rgba(t.muted, 0.8)}>
            {price.base_price != null ? <>Platform base <Txt size={0.78} variant="bodyBold">{money(price.base_price)}</Txt></> : null}
            {price.typical_low != null && price.typical_high != null ? " · Typical " + money(price.typical_low) + "–" + money(price.typical_high) : null}
            {price.unit ? " (" + price.unit + ")" : null}
          </Txt>
          {price.base_price != null ? (
            <Button onPress={() => on({ amount: String(price.base_price), labour: "", parts: "", callout: "", used_base_price: true })}>Use base price</Button>
          ) : null}
        </View>
      ) : null}
      {v.used_base_price ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.s1, marginTop: t.s3 }}>
          <Ic name="check-circle" size={ui.icon.sm} color={t.success} />
          <Txt size={0.78} variant="bodyMedium" color={t.success}>Using platform base price</Txt>
        </View>
      ) : null}
      <Note>Itemise your price (optional) — clients trust and approve detailed estimates faster.</Note>
      <View style={{ flexDirection: "row", gap: t.s2 }}>
        {keys.map(([k, label, ph]) => (
          <View key={k} style={{ flex: 1 }}>
            <Field label={label} keyboardType="decimal-pad" placeholder={ph ? "$" + ph : "$"} value={v[k] ?? ""}
              onChangeText={(x) => on({ [k]: moneyInput(x), used_base_price: false })} />
          </View>
        ))}
      </View>
      {any ? <Txt size={0.85} variant="bodyMedium" color={t.success} style={{ marginTop: t.s2 }}>{"Itemised total: $" + sum.toFixed(2)}</Txt> : null}
      <Label>Price range (optional)</Label>
      <Note tight>Show the client a low–high estimate</Note>
      <View style={{ flexDirection: "row", gap: t.s3 }}>
        <View style={{ flex: 1 }}><Field label="Low $" keyboardType="decimal-pad" placeholder={price?.typical_low != null ? "$" + price.typical_low : "Low $"} value={v.price_low ?? ""} onChangeText={(x) => on({ price_low: moneyInput(x) })} /></View>
        <View style={{ flex: 1 }}><Field label="High $" keyboardType="decimal-pad" placeholder={price?.typical_high != null ? "$" + price.typical_high : "High $"} value={v.price_high ?? ""} onChangeText={(x) => on({ price_high: moneyInput(x) })} /></View>
      </View>
      <Tick checked={!!v.subject} onChange={(x) => on({ subject: x })} label="Final price subject to on-site inspection">
        <Txt size={0.82} color={rgba(t.muted, 0.8)}>Final price subject to on-site inspection</Txt>
      </Tick>
    </View>
  );
}
