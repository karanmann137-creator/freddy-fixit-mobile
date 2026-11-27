// The price panels of web ClientDashboard's job card: the pending price change on
// a held job (anchor "price"), the pre-work hike (anchor "hike") and the quote
// breakdown. Every figure comes from the server's price_preview (pricePreview.ts),
// which mirrors the charge path, so the app never does fee arithmetic (PLAN §0).
// A preview still loading says so; a failed one shows no figure and blocks Approve.
//
// MONEY: display only; the change is applied by adjust-payment / decline_price_change
// / approve_job_schedule server-side. Touches none of the four payout guards.
import React from "react";
import { View } from "react-native";
import { Button, Card, Ic, Txt, rgba, ui, useTheme } from "@/kit";
import { pcMoney, pcRateLabel } from "@/lib/priceChange";
import { jobFullyFunded } from "@/lib/jobFunding";
import { Anchor } from "./anchors";

import { previewStamp, usePricePreview } from "./pricePreview";

function Line({ label, value, strong, color, top }: { label: string; value: string; strong?: boolean; color?: string; top?: boolean }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: t.s4, paddingVertical: t.s2,
      ...(top ? { marginTop: t.s1, paddingTop: t.s3, borderTopWidth: t.hairW, borderTopColor: rgba(t.fg, 0.14) } : null) }}>
      <Txt size={0.84} lh={1.45} color={rgba(t.muted, 0.8)} style={{ flex: 1 }}>{label}</Txt>
      <Txt variant={strong ? "bodyBold" : "bodyMedium"} size={strong ? 0.98 : 0.88} color={color ?? t.text}>{value}</Txt>
    </View>
  );
}

function Reason({ text }: { text: string }) {
  const { t } = useTheme();
  return (
    <View style={{ marginTop: t.s4, padding: t.s3, borderRadius: t.r2, backgroundColor: rgba(t.accentRgb, 0.06), borderLeftWidth: ui.stateBar, borderLeftColor: t.accent500 }}>
      <Txt variant="label" size={0.72} color={rgba(t.muted, 0.55)}>THEIR REASON</Txt>
      <Txt size={0.88} lh={1.6} style={{ marginTop: t.s1 }}>{"“" + text + "”"}</Txt>
    </View>
  );
}

/** Held job, pending change (web "THE PENDING PRICE CHANGE"). Four branches because adjust-payment behaves four ways. */
export function PriceChangePanel({ job, busy, primary, onApprove, onDecline }: {
  job: any; busy: boolean; primary: boolean;
  /** `payNow`: approving opens a checkout for the difference (web's mode "topup"). */
  onApprove: (payNow: boolean) => void; onDecline: () => void;
}) {
  const { t } = useTheme();
  const { pc, failed } = usePricePreview(job?.id, null, previewStamp(job));
  const reason: string | null = job?.price_change_pending?.reason ?? null;
  const paidInFull = jobFullyFunded(job);
  const box = { marginTop: t.s4, paddingHorizontal: t.s4, paddingVertical: t.s2, borderRadius: t.r3, backgroundColor: rgba(t.fg, 0.035), borderWidth: t.hairW, borderColor: rgba(t.fg, 0.09) };
  const payNow = !!pc && pc.isIncrease && paidInFull;
  return (
    <Anchor id="price">
      <Card style={{ padding: t.s4, borderColor: rgba(t.warnRgb, 0.35), backgroundColor: rgba(t.warnRgb, 0.07) }}>
        <View style={{ flexDirection: "row", gap: t.s3, alignItems: "flex-start" }}>
          <Ic name="alert-triangle" size={ui.icon.lg} color={t.warn} />
          <View style={{ flex: 1 }}>
            <Txt variant="bodyBold" size={1} lh={1.3}>
              {!pc ? "Your pro proposed a new price" : pc.isIncrease ? "Your pro proposed a higher price" : pc.isReduction ? "Your pro proposed a lower price" : "Your pro updated the price breakdown"}
            </Txt>
            <Txt size={0.82} lh={1.55} color={rgba(t.muted, 0.7)} style={{ marginTop: t.s1 }}>Nothing is charged at the new price until you approve it.</Txt>
          </View>
        </View>
        {reason ? <Reason text={reason} /> : null}
        {!pc && !failed ? (
          <Txt size={0.86} lh={1.6} color={rgba(t.muted, 0.7)} style={{ marginTop: t.s4 }}>Working out the new total…</Txt>
        ) : !pc ? (
          <Txt size={0.86} lh={1.6} color={t.warn} style={{ marginTop: t.s4 }}>
            We couldn’t load the service fee just now, so we can’t show what approving would cost. Pull down to try again — you can still decline.
          </Txt>
        ) : (
          <>
            <View style={box}>
              <Line label="Price you agreed to" value={pcMoney(pc.oldPrice)} />
              {pc.isIncrease || pc.isReduction ? (
                <Line label={pc.isIncrease ? "Increase" : "Reduction"} value={(pc.isIncrease ? "+" : "−") + pcMoney(Math.abs(pc.delta))} color={pc.isIncrease ? t.accent500 : t.success} />
              ) : null}
              <Line label="New job price" value={pcMoney(pc.newPrice)} />
              {pc.rate > 0
                ? <Line label={"Service fee (" + pcRateLabel(pc.rate) + " of the job price)"} value={pcMoney(pc.newFee)} />
                : <Line label="Service fee" value="Waived" color={t.success} />}
              <Line label="New total" value={pcMoney(pc.newTotal)} strong color={t.accent500} top />
            </View>
            <View style={[box, { paddingVertical: t.s3 }]}>
              <Txt variant="label" size={0.74} color={rgba(t.muted, 0.55)} style={{ marginBottom: t.s2 }}>WHAT THIS MEANS FOR YOUR PAYMENT</Txt>
              <Txt size={0.86} lh={1.7} color={rgba(t.muted, 0.85)}>
                {pc.isIncrease && paidInFull
                  ? "You have paid " + pcMoney(pc.funded) + ", which covers this job in full. Approving takes you to a secure checkout for the " + pcMoney(pc.balanceOwed) + " difference. What you have already paid is not re-collected and not recalculated."
                  : pc.isIncrease
                    ? "You have paid " + pcMoney(pc.funded) + " so far, and that is not re-collected or recalculated. Nothing is charged right now. Approving raises what is due once the work is finished to " + pcMoney(pc.balanceOwed) + "."
                    : pc.isReduction
                      ? "You have paid " + pcMoney(pc.funded) + ". " + (pc.refund > 0.005
                        ? "Approving refunds " + pcMoney(pc.refund) + " to the card you paid with, usually within 5–10 business days."
                        : "Approving lowers what is due once the work is finished to " + pcMoney(pc.balanceOwed) + ".")
                      : "The total does not change — your pro has only re-itemised how the price breaks down. You have paid " + pcMoney(pc.funded) + ", leaving " + pcMoney(pc.balanceOwed) + " due at the end."}
              </Txt>
              {job?.price_change_pending?.subject === true ? (
                <Txt size={0.8} lh={1.6} color={rgba(t.muted, 0.7)} style={{ marginTop: t.s3 }}>Your pro marked this as subject to a closer look on site, so it could still move once they are into the work.</Txt>
              ) : null}
            </View>
          </>
        )}
        <View style={{ marginTop: t.s4, gap: t.s2 }}>
          {/* Paying the difference is a checkout: until payments return to the app (E2) it
              happens on the website. Every other approval is applied right here. */}
          <Button full variant={primary ? "primary" : "secondary"} loading={busy} disabled={!pc} onPress={() => onApprove(payNow)}>
            {!pc ? "Approve" : payNow ? "Approve & pay " + pcMoney(pc.balanceOwed) + " on the website" : pc.isIncrease ? "Approve the new price" : pc.isReduction ? "Approve the lower price" : "Approve the update"}
          </Button>
          <Button full variant="ghost" disabled={busy} onPress={onDecline}>Decline</Button>
        </View>
        <Txt size={0.8} lh={1.65} color={rgba(t.muted, 0.6)} style={{ marginTop: t.s3 }}>
          You do not have to accept it. Declining keeps the price you agreed to{pc ? " at " + pcMoney(pc.oldPrice) : ""} — talk it through in the messages on this job first, so what you agree stays on the record.
        </Txt>
      </Card>
    </Anchor>
  );
}

/** Unpaid job, price already raised (web PRE-WORK PRICE HIKE). Shown inside the schedule proposal. */
export function PriceHikePanel({ job, busy, onDeclineReopen }: { job: any; busy: boolean; onDeclineReopen: () => void }) {
  const { t } = useTheme();
  const { pc: hk, failed } = usePricePreview(job?.id, null, previewStamp(job));
  return (
    <Anchor id="hike">
      <Card style={{ padding: t.s4, marginBottom: t.s4, borderColor: rgba(t.dangerRgb, 0.4), backgroundColor: rgba(t.dangerRgb, 0.08) }}>
        <View style={{ flexDirection: "row", gap: t.s3, alignItems: "flex-start" }}>
          <Ic name="alert-triangle" size={ui.icon.lg} color={t.danger} />
          <View style={{ flex: 1 }}>
            <Txt variant="bodyBold" size={1} lh={1.3} color={t.danger}>Your pro raised the price</Txt>
            <Txt size={0.82} lh={1.55} color={rgba(t.muted, 0.75)} style={{ marginTop: t.s1 }}>This is more than the estimate you picked them on. Nothing has been charged.</Txt>
          </View>
        </View>
        {job?.price_hike_reason ? <Reason text={job.price_hike_reason} /> : null}
        {hk ? (
          <View style={{ marginTop: t.s4, paddingHorizontal: t.s4, paddingVertical: t.s2, borderRadius: t.r3, backgroundColor: rgba(t.fg, 0.035), borderWidth: t.hairW, borderColor: rgba(t.fg, 0.09) }}>
            <Line label="The estimate you picked" value={pcMoney(hk.oldPrice)} />
            <Line label="Increase" value={"+" + pcMoney(hk.delta)} color={t.danger} />
            <Line label="New job price" value={pcMoney(hk.newPrice)} />
            {hk.rate > 0
              ? <Line label={"Service fee (" + pcRateLabel(hk.rate) + " of the job price)"} value={pcMoney(hk.newFee)} />
              : <Line label="Service fee" value="Waived" color={t.success} />}
            <Line label="New total" value={pcMoney(hk.newTotal)} strong color={t.danger} top />
          </View>
        ) : failed ? (
          <Txt size={0.84} color={t.warn} style={{ marginTop: t.s4 }}>We couldn’t load the service fee just now, so the new total isn’t shown. Pull down to try again.</Txt>
        ) : (
          <Txt size={0.84} color={rgba(t.muted, 0.7)} style={{ marginTop: t.s4 }}>Working out the new total…</Txt>
        )}
        <Txt size={0.84} lh={1.7} color={rgba(t.muted, 0.8)} style={{ marginTop: t.s4 }}>
          You do not have to accept it. Approve the time and the new price below, or decline and let the other pros who bid win your job instead — you keep your request and their estimates, and you do not start over.
        </Txt>
        <View style={{ marginTop: t.s4 }}>
          <Button full variant="danger" loading={busy} onPress={onDeclineReopen}>Decline & re-open to other pros</Button>
        </View>
      </Card>
    </Anchor>
  );
}

/** Web QuoteBreakdownView: the stored labour / parts / call-out lines, range and notes. Shows stored figures only. */
export function QuoteBreakdown({ row, assumptionsKey = "quote_assumptions" }: { row: any; assumptionsKey?: string }) {
  const { t } = useTheme();
  const items: [string, any][] = [["Labour", row?.labour_amount], ["Parts & materials", row?.parts_amount], ["Call-out", row?.callout_fee]];
  const present = items.filter(([, v]) => v != null);
  const assumptions = row?.[assumptionsKey];
  const hasRange = row?.price_low != null && row?.price_high != null;
  if (present.length === 0 && !assumptions && !row?.subject_to_inspection && !hasRange) return null;
  return (
    <View style={{ marginTop: t.s2, padding: t.s3, borderRadius: t.r2, backgroundColor: rgba(t.fg, 0.04), borderWidth: t.hairW, borderColor: rgba(t.fg, 0.08), gap: t.s1 }}>
      {present.length > 0 ? <Txt variant="label" size={0.7} color={rgba(t.muted, 0.45)}>PRICE BREAKDOWN</Txt> : null}
      {present.map(([l, v]) => (
        <View key={l} style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Txt size={0.82} color={rgba(t.muted, 0.8)}>{l}</Txt><Txt size={0.82} color={rgba(t.muted, 0.8)}>{"$" + Number(v).toFixed(2)}</Txt>
        </View>
      ))}
      {hasRange ? <Txt variant="bodyMedium" size={0.82}>{"Estimated range: $" + Number(row.price_low).toFixed(0) + "–$" + Number(row.price_high).toFixed(0)}</Txt> : null}
      {assumptions ? <Txt size={0.78} lh={1.45} color={rgba(t.muted, 0.65)}>{String(assumptions)}</Txt> : null}
      {row?.subject_to_inspection ? <Txt size={0.78} lh={1.4} color={t.warn}>Heads up: the final price may change after the contractor inspects the job on-site.</Txt> : null}
    </View>
  );
}
