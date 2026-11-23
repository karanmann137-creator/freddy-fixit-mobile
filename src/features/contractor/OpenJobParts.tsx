// The pieces of an open job as the web Available card shows them (port of
// web contractor/ContractorAvailableTab.tsx), shared by the Available list and
// the open-job screen so the two can never show different numbers.
//
// Display only. Every number is the server's (list_open_jobs) or the synced
// price book's (servicePricing.ts); nothing here is computed beyond what web shows.
import React, { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { Ic, Pill, Txt, rgba, ui, useTheme, type PillTone } from "@/kit";
import { supabase } from "@/lib/supabase";
import { freqLabel } from "@/lib/recurrence";
import { tidyDescription } from "@/lib/jobText";
import { TARGET_BID_DISCOUNT, benchmarkFor, gradeLabel, money, rangeText, targetBid, type Grade, type ServicePrice } from "@/lib/servicePricing";
import { BID_CAP_SHOWN, hasMyBid, priceFor, type OpenJob } from "./bid";

/** web `PriceGrade kind="budget"`. Web paints A+ green, A brand, A- amber; on a
 *  phone orange means "it's on you", so A is neutral here. */
const GRADE_TONE: Record<Grade, PillTone> = { "A+": "good", A: "neutral", "A-": "warn" };

/** The chips at the top of a web card: New, reserved-for-you, recurring. */
export function JobBadges({ r, full }: { r: OpenJob; full?: boolean }) {
  const { t } = useTheme();
  const isNew = r.my_amount == null && !r.my_walkthrough;
  return (
    <View style={{ gap: t.s2 }}>
      {isNew || r.is_preferred || (r.is_recurring && !full) ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2 }}>
          {isNew ? <Pill tone="neutral">New</Pill> : null}
          {/* The one chip that is about this pro specifically. */}
          {r.is_preferred ? <Pill tone="accent">This client requested you — reserved for 48h</Pill> : null}
          {r.is_recurring && !full ? <Pill tone="neutral">{"Recurring" + (r.recurring_frequency ? " · " + freqLabel(r.recurring_frequency) : "")}</Pill> : null}
        </View>
      ) : null}
      {r.is_recurring && full ? (
        <View style={{ flexDirection: "row", gap: t.s2, padding: t.s3, borderRadius: t.r2, backgroundColor: rgba(t.fg, 0.04), borderWidth: t.hairW, borderColor: rgba(t.fg, 0.08) }}>
          <Ic name="repeat" size={ui.icon.md} color={rgba(t.muted, 0.9)} />
          <Txt size={0.82} lh={1.5} style={{ flex: 1 }}>
            <Txt size={0.82} variant="bodyBold">{"Recurring" + (r.recurring_frequency ? " · " + freqLabel(r.recurring_frequency) : "") + "."}</Txt>
            {" Winning this makes you the client's go-to pro — you'll be expected to return at the agreed times each visit."}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

/** Service + typical range, preferred schedule, approximate location (masked by the server). */
export function JobHead({ r, pricing }: { r: OpenJob; pricing: Record<string, ServicePrice> }) {
  const { t } = useTheme();
  const typical = rangeText(priceFor(pricing, r.service_needed));
  return (
    <View style={{ gap: t.s1 }}>
      <Txt variant="bodyMedium" size={1.05}>{r.service_needed ?? "Job"}</Txt>
      {typical ? <Txt size={0.78} color={rgba(t.muted, 0.6)}>{"Typical " + typical}</Txt> : null}
      {r.preferred_schedule ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.s1, marginTop: t.s1 }}>
          <Ic name="timer" size={ui.icon.sm} color={rgba(t.muted, 0.8)} />
          <Txt size={0.85} color={t.text} style={{ flex: 1 }}>{r.preferred_schedule}</Txt>
        </View>
      ) : null}
      {r.location ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.s1 }}>
          <Ic name="map-pin" size={ui.icon.sm} color={rgba(t.muted, 0.8)} />
          <Txt size={0.85} color={rgba(t.muted, 0.75)} style={{ flex: 1 }}>{r.location}</Txt>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Money on this job vs the category average: web's budget box, line for line.
 * `budget_min` is OUR platform base price (not a client floor), so it reads
 * "Base price"; only a client-chosen max counts as "they told us a budget", and
 * the grade shows only beside one. The suggested bid is a guide, never a cap.
 */
export function BudgetBox({ r, pricing }: { r: OpenJob; pricing: Record<string, ServicePrice> }) {
  const { t } = useTheme();
  const local = benchmarkFor(r.service_needed, pricing);
  const bench = r.benchmark != null ? Number(r.benchmark) : (local?.benchmark ?? null);
  const bLo = r.budget_min != null ? Number(r.budget_min) : null;
  const bHi = r.budget_max != null ? Number(r.budget_max) : null;
  const grade = (r.budget_grade ?? null) as Grade | null;
  const hasBudget = !r.budget_flexible && bHi != null;
  const target = targetBid(bench, bLo);
  if (!hasBudget && bLo == null && !r.budget_flexible && bench == null) return null;
  const muted = rgba(t.muted, 0.65);
  return (
    <View style={{ gap: t.s2, padding: t.s3, borderRadius: t.r2, backgroundColor: rgba(t.fg, 0.04), borderWidth: t.hairW, borderColor: rgba(t.fg, 0.08) }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: t.s2 }}>
        <Ic name="dollar" size={ui.icon.sm} color={rgba(t.muted, 0.9)} />
        {(bLo != null || hasBudget) ? (
          <Txt size={0.85}>
            {bLo != null ? <><Txt size={0.85} color={muted}>Base price </Txt><Txt size={0.85} variant="bodyBold">{money(bLo)}</Txt></> : null}
            {bLo != null && (hasBudget || r.budget_flexible) ? <Txt size={0.85} color={muted}>{" · "}</Txt> : null}
            {hasBudget
              ? <><Txt size={0.85} color={muted}>Client max </Txt><Txt size={0.85} variant="bodyBold">{money(bHi)}</Txt></>
              : r.budget_flexible ? <Txt size={0.85} color={muted}>client is flexible</Txt> : null}
          </Txt>
        ) : (
          <Txt size={0.85} color={muted}>{r.budget_flexible ? "Client is flexible — send your quote" : "No budget set"}</Txt>
        )}
        {hasBudget && grade && GRADE_TONE[grade] ? <Pill tone={GRADE_TONE[grade]}>{grade + " " + gradeLabel(grade, "budget")}</Pill> : null}
      </View>
      {target != null ? (
        <View>
          <Txt size={0.82}><Txt size={0.82} color={muted}>Suggested bid </Txt><Txt size={0.82} variant="bodyBold">{money(target)}</Txt></Txt>
          <Txt size={0.74} lh={1.45} color={rgba(t.muted, 0.55)} style={{ marginTop: ui.nudge2 }}>
            {Math.round(TARGET_BID_DISCOUNT * 100) + "% under the category average — a guide, not a limit. Bid what the job is worth to you."}
          </Txt>
        </View>
      ) : null}
      {bench != null ? (
        <Txt size={0.74} color={rgba(t.muted, 0.55)}>
          {"Category average " + money(Math.round(bench)) + (r.benchmark_source === "jobs" ? " (from completed jobs)" : " (Calgary price guide)")}
        </Txt>
      ) : null}
    </View>
  );
}

/** web `JobDescription`: tidyDescription paragraphs (normalise, never rewrite). `lines` clamps for the list. */
export function JobText({ text, lines }: { text: string | null | undefined; lines?: number }) {
  const { t } = useTheme();
  const paras = tidyDescription(text);
  if (paras.length === 0) return null;
  if (lines) {
    return <Txt size={0.85} lh={1.55} color={rgba(t.muted, 0.75)} numberOfLines={lines}>{paras.join("\n")}</Txt>;
  }
  return (
    <View style={{ gap: t.s2 }}>
      {paras.map((p, i) => <Txt key={i} size={0.9} lh={1.55} color={rgba(t.fg, 0.9)}>{p}</Txt>)}
    </View>
  );
}

/** "Bids n/7": web paints it warn at the cap, success below. */
export function BidCount({ r }: { r: OpenJob }) {
  const n = r.bid_count ?? 0;
  return <Pill tone={n >= BID_CAP_SHOWN ? "warn" : "good"}>{n + "/" + BID_CAP_SHOWN}</Pill>;
}

/** The pro's own bid state, one line, for the list card. */
export function MyBidLine({ r }: { r: OpenJob }) {
  const { t } = useTheme();
  if (hasMyBid(r)) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.s1, flex: 1 }}>
        <Ic name="check-circle" size={ui.icon.sm} color={t.success} />
        <Txt size={0.85} color={t.text} numberOfLines={1} style={{ flex: 1 }}>Your bid has been placed</Txt>
      </View>
    );
  }
  if ((r.bid_count ?? 0) >= BID_CAP_SHOWN) {
    return <Txt size={0.82} color={t.warn} style={{ flex: 1 }}>{"This job already has " + BID_CAP_SHOWN + " bids."}</Txt>;
  }
  return <Txt size={0.85} variant="bodyMedium" style={{ flex: 1 }}>Place a bid</Txt>;
}

type PhotoRead = { key: string; url: string | null; failed: boolean };

/**
 * web `RequestPhotoQuote` (read-only for a pro): the job photo and the client's
 * own estimate, if any. The photo is a signed URL from `problem-photos`; a failed
 * signing is said and can be retried, never shown as "no photo".
 */
export function JobPhotoQuote({ r }: { r: OpenJob }) {
  const { t } = useTheme();
  const [nonce, setNonce] = useState(0);
  const [read, setRead] = useState<PhotoRead | null>(null);
  const path = r.photo_path ?? null;
  const key = `${path}|${nonce}`;
  useEffect(() => {
    if (!path) return;
    let stale = false;
    supabase.storage.from("problem-photos").createSignedUrl(path, 3600)
      .then(({ data, error }) => { if (!stale) setRead({ key, url: data?.signedUrl ?? null, failed: !!error || !data?.signedUrl }); })
      .catch(() => { if (!stale) setRead({ key, url: null, failed: true }); });
    return () => { stale = true; };
  }, [key, path]);
  const shown = read?.key === key ? read : null;
  const quote = r.estimated_quote != null && Number(r.estimated_quote) > 0 ? Number(r.estimated_quote) : null;
  if (!path && quote == null) return null;
  return (
    <View style={{ gap: t.s3 }}>
      {path ? (
        <View>
          <Txt variant="label" size={0.75} color={rgba(t.muted, 0.6)} style={{ marginBottom: t.s2 }}>JOB PHOTO</Txt>
          {shown?.url ? (
            <Image source={{ uri: shown.url }} accessibilityLabel="Job photo" accessibilityIgnoresInvertColors resizeMode="cover"
              style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: t.r2, borderWidth: t.hairW, borderColor: rgba(t.fg, 0.08), backgroundColor: rgba(t.fg, 0.04) }} />
          ) : shown?.failed ? (
            <Txt size={0.85} color={t.warn} onPress={() => setNonce((n) => n + 1)} accessibilityRole="button" style={{ minHeight: t.hCtl, textAlignVertical: "center" }}>
              {"We couldn't load the photo. Tap to try again."}
            </Txt>
          ) : (
            <View style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: t.r2, backgroundColor: rgba(t.fg, 0.04) }} />
          )}
        </View>
      ) : null}
      {quote != null ? (
        <View style={{ padding: t.s3, borderRadius: t.r2, backgroundColor: rgba(t.fg, 0.04), borderWidth: t.hairW, borderColor: rgba(t.fg, 0.08) }}>
          <Txt variant="label" size={0.75} color={rgba(t.muted, 0.6)}>ESTIMATE</Txt>
          <Txt variant="bodyBold" size={1.2} style={{ marginTop: t.s1 }}>{"$" + quote.toLocaleString()}</Txt>
          {r.quote_notes ? <Txt size={0.82} lh={1.5} color={rgba(t.muted, 0.7)} style={{ marginTop: t.s1 }}>{r.quote_notes}</Txt> : null}
        </View>
      ) : null}
    </View>
  );
}
