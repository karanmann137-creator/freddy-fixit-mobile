// The contractor job screen's two forms (PLAN 5.7):
//   · AssignedStage — web ContractorDashboard.tsx:2531-2635: slot-released note,
//     the free walkthrough (propose_walkthrough / complete_walkthrough), and the
//     time & price proposal (propose_job_schedule) with Withdraw (canWithdraw).
//   · PriceChange   — web renderPriceChange (:1038): propose_price_change, the
//     pending banner and withdraw_price_change.
//
// MONEY GUARDS TOUCHED: none. Every amount the pro types goes to an RPC that
// validates it; every total and payout shown is the server's price_preview
// (features/job/pricePreview.ts, PLAN §0), the same figures the client's panel
// reads. A preview that failed shows no number. Nothing here computes money.
import React, { useState } from "react";
import { View } from "react-native";
import { Button, Field, Ic, Txt, askConfirm, notify, rgba, ui, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { canWithdraw } from "@/lib/jobRules";
import { jobFullyFunded } from "@/lib/jobFunding";
import { pcMoney, pcRateLabel } from "@/lib/priceChange";
import { previewStamp, usePricePreview } from "@/features/job/pricePreview";
import type { ServicePrice } from "@/lib/servicePricing";
import { LinkButton } from "@/features/request/pieces";
import { QuoteBreakdown } from "../OpenJobScreen";
import { moneyInput, quoteTotal, type BidForm } from "../bid";
import { A_PRICE, A_PROPOSE, A_WALK } from "../rules";
import { calgaryWallToIso, isoToCalgaryWall, whenLong } from "../calendarRules";
import { Anchor } from "./anchors";
import { ScheduleField } from "./JobSections";
import { Line, MoneyRow, P, Panel } from "./parts";

type Ctx = { job: any; busy: boolean; run: (fn: () => Promise<void>) => Promise<void>; reload: () => Promise<unknown> };

// ── Withdraw (web withdrawJob) ────────────────────────────────────────────────
// Rendered only when canWithdraw(job) (synced jobRules: mirrors job_money_block,
// deliberately stricter). The server's refusal is shown verbatim.
export function WithdrawButton({ job, busy, run, onGone }: { job: any; busy: boolean; run: Ctx["run"]; onGone: () => void }) {
  if (!canWithdraw(job)) return null;
  const go = () => run(async () => {
    if (!(await askConfirm({
      title: "Withdraw from this job?",
      message: "The job goes back to the open pool. Everything attached to it is permanently removed — your chat history, the service agreement, any photos, logged costs and tracked time. If the client has already paid, you can't withdraw: message them to sort it out, or email hello@freddyfixit.ca.",
      confirmLabel: "Yes, withdraw", danger: true,
    }))) return;
    const { error } = await supabase.rpc("withdraw_job", { p_job_id: job.id });
    if (error) { notify("Couldn't withdraw: " + error.message, "danger"); return; }
    notify("You've withdrawn from this job.");
    onGone();
  });
  return <Button variant="danger" disabled={busy} onPress={() => void go()}>Withdraw</Button>;
}

type ProposeForm = BidForm & { when: string; notes: string; items: { label: string; amount: string }[] };

const seed = (job: any): ProposeForm => ({
  when: isoToCalgaryWall(job.scheduled_at),
  amount: job.amount != null ? String(job.amount) : "", message: "",
  notes: job.notes ?? "",
  labour: job.labour_amount != null ? String(job.labour_amount) : "",
  parts: job.parts_amount != null ? String(job.parts_amount) : "",
  callout: job.callout_fee != null ? String(job.callout_fee) : "",
  subject: !!job.subject_to_inspection,
  price_low: job.price_low != null ? String(job.price_low) : "",
  price_high: job.price_high != null ? String(job.price_high) : "",
  used_base_price: !!job.used_base_price,
  items: Array.isArray(job.quote_items) ? job.quote_items.map((i: any) => ({ label: String(i?.label ?? ""), amount: i?.amount != null ? String(i.amount) : "" })) : [],
});

export function AssignedStage({ job, busy, run, reload, primary, minCallout, price, onGone }: Ctx & {
  primary: string | null; minCallout: number | null; price: ServicePrice | null; onGone: () => void;
}) {
  const { t } = useTheme();
  const [f, setF] = useState<ProposeForm>(() => seed(job));
  const [wt, setWt] = useState({ when: isoToCalgaryWall(job.walkthrough_at), note: job.walkthrough_note ?? "" });
  const [wtOpen, setWtOpen] = useState(false);
  const patch = (p: Partial<ProposeForm>) => setF((x) => ({ ...x, ...p }));
  const paid = (job.payment_status ?? "unpaid") !== "unpaid";

  const proposeWalkthrough = () => run(async () => {
    const iso = wt.when ? calgaryWallToIso(wt.when) : null;
    if (!iso) { notify("Pick a date and time for the walkthrough.", "danger"); return; }
    const { error } = await supabase.rpc("propose_walkthrough", { p_job_id: job.id, p_at: iso, p_note: wt.note || null });
    if (error) { notify("Couldn't propose the walkthrough: " + error.message, "danger"); return; }
    setWtOpen(false);
    notify("Walkthrough proposed — the client will confirm the time.");
    await reload();
  });
  const completeWalkthrough = () => run(async () => {
    const { error } = await supabase.rpc("complete_walkthrough", { p_job_id: job.id });
    if (error) { notify("Couldn't mark the walkthrough done: " + error.message, "danger"); return; }
    notify("Walkthrough done — now send your estimate below.");
    await reload();
  });
  const propose = () => run(async () => {
    const whenIso = f.when ? calgaryWallToIso(f.when) : null;
    if (!whenIso) { notify("Pick a date and time first.", "danger"); return; }
    const clean = f.items.filter((i) => i.label.trim() && i.amount !== "" && !isNaN(Number(i.amount)));
    if (f.items.some((i) => i.label.trim() && (i.amount === "" || isNaN(Number(i.amount))))) { notify("Give every optional add-on a price (or remove it).", "danger"); return; }
    const { error } = await supabase.rpc("propose_job_schedule", {
      p_job_id: job.id, p_scheduled_at: whenIso, p_amount: quoteTotal(f), p_notes: f.notes || null,
      p_labour: f.labour ? Number(f.labour) : null, p_parts: f.parts ? Number(f.parts) : null, p_callout: f.callout ? Number(f.callout) : null,
      p_subject_to_inspection: !!f.subject,
      p_price_low: f.price_low ? Number(f.price_low) : null, p_price_high: f.price_high ? Number(f.price_high) : null,
      p_used_base_price: !!f.used_base_price,
      p_quote_items: clean.length ? clean.map((i) => ({ label: i.label.trim(), amount: Number(i.amount) })) : null,
    });
    if (error) { notify("Couldn't send proposal: " + error.message, "danger"); return; }
    notify("Proposal sent — your client will approve the time and price.");
    await reload();
  });

  return (
    <View>
      {job.slot_released_at && !job.schedule_proposed_at ? (
        <View style={{ marginTop: t.s4 }}>
          <Panel tone="warn">
            <P><Txt size={0.85} variant="bodyBold">The booked time was released. </Txt>
              {(job.slot_released_from ? whenLong(job.slot_released_from) + " came round without the agreement being signed and paid, so we freed the slot rather than hold it." : "The agreement wasn't signed and paid in time, so we freed the slot rather than hold it.") + " You still have this job — propose a new time below and your client can approve it as usual."}</P>
          </Panel>
        </View>
      ) : null}

      {job.walkthrough_done_at ? (
        <Line icon="check-circle" color={t.success}>{"Walkthrough done \u2014 send your estimate below while it's fresh."}</Line>
      ) : job.walkthrough_proposed_at && job.walkthrough_approved_at ? (
        <Anchor id={A_WALK}>
          <Panel tone="good">
            <P><Txt size={0.85} variant="bodyBold">Walkthrough confirmed </Txt>{"for " + whenLong(job.walkthrough_at) + ". It's a free visit — after you've seen the space, mark it done and send your estimate."}</P>
            <Button variant={primary === A_WALK ? "primary" : "secondary"} disabled={busy} onPress={() => void completeWalkthrough()}>Walkthrough done</Button>
          </Panel>
        </Anchor>
      ) : job.walkthrough_proposed_at ? (
        <View style={{ marginTop: t.s4 }}>
          <Panel tone="accent">
            <P>{"Waiting for the client to confirm your walkthrough on " + whenLong(job.walkthrough_at, "the proposed time") + ". Need to change it?"}</P>
            <ScheduleField value={wt.when} onChange={(v) => setWt((x) => ({ ...x, when: v }))} />
            <Button disabled={busy} onPress={() => void proposeWalkthrough()}>Update time</Button>
          </Panel>
        </View>
      ) : !job.schedule_proposed_at ? (
        <View style={{ marginTop: t.s4 }}>
          <Panel dashed>
            {!wtOpen ? (
              <>
                <P>Hard to price without seeing it? Propose a free walkthrough first — see the space, then send your estimate on the spot.</P>
                <LinkButton onPress={() => setWtOpen(true)}>Propose a free walkthrough first</LinkButton>
              </>
            ) : (
              <>
                <P><Txt size={0.85} variant="bodyBold">Propose a walkthrough visit. </Txt>{"The client approves the time \u2014 it's free, nothing is charged. After the visit, send your estimate below."}</P>
                <ScheduleField value={wt.when} onChange={(v) => setWt((x) => ({ ...x, when: v }))} />
                <Field label="Note for the client (optional)" placeholder="e.g. takes about 20 minutes" value={wt.note} onChangeText={(v) => setWt((x) => ({ ...x, note: v }))} />
                <Button disabled={busy} onPress={() => void proposeWalkthrough()}>Propose walkthrough</Button>
                <Button variant="ghost" disabled={busy} onPress={() => setWtOpen(false)}>Cancel</Button>
              </>
            )}
          </Panel>
        </View>
      ) : null}

      {job.schedule_proposed_at && !job.client_approved_at ? (
        <Line icon="clock" color={t.warn}>{"Waiting for the client to approve " + whenLong(job.scheduled_at, "your proposed time") + ". You can update it below."}</Line>
      ) : null}

      <Anchor id={A_PROPOSE}>
        <View style={{ gap: t.s3, padding: t.s1 }}>
          <Txt variant="label" size={0.78} color={rgba(t.muted, 0.6)}>{job.schedule_proposed_at ? "YOUR PROPOSAL" : "PROPOSE A TIME AND PRICE"}</Txt>
          <ScheduleField value={f.when} onChange={(v) => patch({ when: v })} />
          <Field label="Price $" keyboardType="decimal-pad" placeholder="e.g. 250" value={f.amount} onChangeText={(v) => patch({ amount: moneyInput(v), used_base_price: false })} />
          <Field label="Notes for the client (optional)" multiline value={f.notes} onChangeText={(v) => patch({ notes: v })} />
          <QuoteBreakdown v={f} on={(p) => patch(p)} calloutHint={minCallout} price={price} target={null} />
          <Panel dashed>
            <Txt variant="label" size={0.74} color={rgba(t.muted, 0.6)}>OPTIONAL ADD-ONS</Txt>
            <Txt size={0.76} lh={1.45} color={rgba(t.muted, 0.6)}>{"Offer extras the client can tick when approving (e.g. \u201cReplace supply lines \u2014 $45\u201d). They're added on top of your price only if the client picks them."}</Txt>
            {f.items.map((it, idx) => (
              <View key={idx} style={{ flexDirection: "row", gap: t.s2, alignItems: "flex-end" }}>
                <View style={{ flex: 2 }}><Field label="Add-on" value={it.label} onChangeText={(v) => patch({ items: f.items.map((x, i) => (i === idx ? { ...x, label: v } : x)) })} /></View>
                <View style={{ flex: 1 }}><Field label="$" keyboardType="decimal-pad" value={it.amount} onChangeText={(v) => patch({ items: f.items.map((x, i) => (i === idx ? { ...x, amount: moneyInput(v) } : x)) })} /></View>
                <Button variant="ghost" accessibilityLabel="Remove add-on" onPress={() => patch({ items: f.items.filter((_, i) => i !== idx) })}><Ic name="x-circle" size={ui.icon.lg} /></Button>
              </View>
            ))}
            {f.items.length < 15 ? <LinkButton onPress={() => patch({ items: [...f.items, { label: "", amount: "" }] })}>+ Add an optional item</LinkButton> : null}
          </Panel>
          <Button full variant={primary === A_PROPOSE ? "primary" : "secondary"} loading={busy} onPress={() => void propose()}>{job.schedule_proposed_at ? "Update proposal" : "Propose time & price"}</Button>
          <WithdrawButton job={job} busy={busy} run={run} onGone={onGone} />
          {/* Keyed on money actually being held, NOT on !canWithdraw (web :2627). */}
          {paid ? <Txt size={0.8} lh={1.5} color={rgba(t.muted, 0.6)}>{"This job is paid for, so it can't be withdrawn here \u2014 message the client, or email hello@freddyfixit.ca if something's gone wrong."}</Txt> : null}
        </View>
      </Anchor>
      {paid ? <PriceChange job={job} busy={busy} run={run} reload={reload} minCallout={minCallout} price={price} /> : null}
    </View>
  );
}

// ── PriceChange (web renderPriceChange) ──────────────────────────────────────
type RQ = BidForm & { reason: string };
const emptyRq = (): RQ => ({ amount: "", message: "", reason: "", labour: "", parts: "", callout: "", subject: false });

/** The bill-from-timer prefill (web JobTimer onBill) reaches the form through this. */
export type BillPrefill = { amount: number | null; reason: string; n: number } | null;

export function PriceChange({ job, busy, run, reload, minCallout, price, prefill }: Ctx & { minCallout: number | null; price: ServicePrice | null; prefill?: BillPrefill }) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  const [rf, setRf] = useState<RQ>(emptyRq);
  // Every figure below is the server's price_preview (PLAN §0): the pending change
  // in its stored shape, and the price being typed, debounced. No local fee or payout math.
  const pending = job.price_change_pending;
  const tot = quoteTotal(rf);
  const stored = usePricePreview(job.id, null, previewStamp(job), !!pending);
  const typed = usePricePreview(job.id, tot != null && tot > 0 ? tot : null, previewStamp(job), !pending && open && tot != null && tot > 0);
  // A new bill-from-timer prefill opens the form with it (React's "adjust state on a prop change" pattern).
  const [seenBill, setSeenBill] = useState<number | null>(null);
  if (prefill && prefill.n !== seenBill) {
    setSeenBill(prefill.n);
    setRf((x) => ({ ...x, amount: prefill.amount != null ? String(prefill.amount) : x.amount, labour: "", parts: "", callout: "", reason: prefill.reason }));
    setOpen(true);
  }

  if (job.payment_status === "released") return null;
  if (job.is_milestone) return null; // priced per stage: the whole-job RPC rejects these (web)
  const patch = (p: Partial<RQ>) => setRf((x) => ({ ...x, ...p }));

  const send = () => run(async () => {
    if (!rf.reason.trim()) { notify("Add a short reason so the client understands the change.", "danger"); return; }
    const total = quoteTotal(rf);
    if (total == null) { notify("Enter the new price or an itemised breakdown.", "danger"); return; }
    const { data, error } = await supabase.rpc("propose_price_change", {
      p_job_id: job.id, p_amount: total, p_reason: rf.reason,
      p_labour: rf.labour ? Number(rf.labour) : null, p_parts: rf.parts ? Number(rf.parts) : null, p_callout: rf.callout ? Number(rf.callout) : null,
      p_subject_to_inspection: !!rf.subject,
      p_price_low: rf.price_low ? Number(rf.price_low) : null, p_price_high: rf.price_high ? Number(rf.price_high) : null,
      p_used_base_price: !!rf.used_base_price,
    });
    if (error) { notify("Couldn't send price change: " + error.message, "danger"); return; }
    notify(data === "pending_client_approval" ? "Price change sent — your client will approve it." : "Revised estimate sent — your client will re-approve the time and price.");
    setOpen(false); setRf(emptyRq());
    await reload();
  });
  const withdraw = () => run(async () => {
    if (!(await askConfirm({ title: "Withdraw this price change?", message: "The client will be told it is withdrawn and the price you both agreed to stays in place. You can always send a new revised estimate afterwards.", confirmLabel: "Withdraw it" }))) return;
    const { error } = await supabase.rpc("withdraw_price_change", { p_job_id: job.id });
    if (error) { notify("Couldn't withdraw it: " + error.message, "danger"); return; }
    await reload();
  });

  if (pending) {
    const pc = stored.pc;
    const payout = pc ? pc.newPayout : null;
    return (
      <Anchor id={A_PRICE}>
        <Panel tone="warn">
          <Txt variant="bodyMedium" size={0.95}>{"Waiting on the client to approve " + pcMoney(pc ? pc.newPrice : Number(pending.amount ?? 0))}</Txt>
          <P>{"The agreed price is still " + pcMoney(pc ? pc.oldPrice : Number(job.amount ?? 0)) + " until they do. Keep working to the original scope until you hear back."}</P>
          {pending.reason ? <View style={{ borderLeftWidth: ui.stateBar, borderLeftColor: t.warn, paddingLeft: t.s3 }}><P>{pending.reason}</P></View> : null}
          {pc ? (
            <View style={{ padding: t.s3, borderRadius: t.r2, backgroundColor: rgba(t.fg, 0.035) }}>
              <MoneyRow label="New job price" value={pcMoney(pc.newPrice)} />
              <MoneyRow label={"Client service fee (" + pcRateLabel(pc.rate) + ")"} value={pcMoney(pc.newFee)} />
              <MoneyRow label="What the client pays in total" value={pcMoney(pc.newTotal)} top />
              {payout != null ? <MoneyRow label="Your payout after commission" value={pcMoney(payout)} top strong /> : null}
            </View>
          ) : null}
          {pc ? (
            <P>{jobFullyFunded(job)
              ? "They have already paid this job in full, so when they approve they are taken straight to a checkout for the " + pcMoney(pc.balanceOwed) + " difference. Nothing reaches you until that clears."
              : "They have paid " + pcMoney(pc.funded) + " so far. Nothing extra is charged today — the balance they settle at the end becomes " + pcMoney(pc.balanceOwed) + "."}</P>
          ) : null}
          <LinkButton onPress={() => { if (!busy) void withdraw(); }}>Withdraw this price change</LinkButton>
          <Txt size={0.76} lh={1.5} color={rgba(t.muted, 0.6)}>Puts the price back and lets the client know. Use this if you sent the wrong figure, or if you have agreed in the messages to leave it alone.</Txt>
        </Panel>
      </Anchor>
    );
  }
  if (!open) {
    return (
      <Anchor id={A_PRICE}>
        <LinkButton onPress={() => setOpen(true)}>Need to adjust the price? Request a change</LinkButton>
      </Anchor>
    );
  }
  const pv = typed.pc;
  const pvPayout = pv ? pv.newPayout : null;
  return (
    <Anchor id={A_PRICE}>
      <View style={{ gap: t.s3, padding: t.s1 }}>
        <Txt size={0.8} lh={1.45} color={rgba(t.muted, 0.65)}>{"Send the client a revised estimate. They'll re-approve (and cover any extra) before it takes effect \u2014 your chat history stays."}</Txt>
        {(job.payment_status ?? "unpaid") === "unpaid" ? (
          <Panel tone="warn"><P><Txt size={0.85} variant="bodyBold">Raising the price can cost you the job. </Txt>Nothing has been paid yet, so the client can decline and re-open the request to the other pros who bid — in one tap, without talking to you first. Only raise it if the work genuinely changed, give the specific reason, and message them about it before you send this.</P></Panel>
        ) : (
          <Panel><P>{"The client has already paid on this job, so they can't hand it to another pro. But they can decline the change \u2014 you'd finish at the agreed price. Give the specific reason and message them first."}</P></Panel>
        )}
        <Field label="New total price $" keyboardType="decimal-pad" value={rf.amount} onChangeText={(v) => patch({ amount: moneyInput(v) })} />
        <QuoteBreakdown v={rf} on={(p) => patch(p)} calloutHint={minCallout} price={price} target={null} />
        {pv ? (
          <Panel tone="accent" dashed>
            <Txt variant="label" size={0.72} color={t.accent500}>WHAT THE CLIENT WILL SEE</Txt>
            <View style={{ padding: t.s3, borderRadius: t.r2, backgroundColor: rgba(t.fg, 0.035) }}>
              <MoneyRow label="Price they agreed to" value={pcMoney(pv.oldPrice)} />
              {pv.isIncrease ? <MoneyRow label="Increase" value={"+" + pcMoney(pv.delta)} /> : pv.isReduction ? <MoneyRow label="Reduction" value={"−" + pcMoney(Math.abs(pv.delta))} /> : null}
              <MoneyRow label="New job price" value={pcMoney(pv.newPrice)} top />
              <MoneyRow label={"Service fee (" + pcRateLabel(pv.rate) + ")"} value={pv.rate === 0 ? "Waived" : pcMoney(pv.newFee)} />
              <MoneyRow label="Their new total" value={pcMoney(pv.newTotal)} top strong />
            </View>
            <P>{pv.isReduction
              ? (pv.funded - pv.newTotal > 0.005 ? "They have paid " + pcMoney(pv.funded) + ", so " + pcMoney(Math.round((pv.funded - pv.newTotal) * 100) / 100) + " goes back to their card." : "The balance they settle at the end comes down to " + pcMoney(pv.balanceOwed) + ".")
              : pv.isIncrease
                ? (jobFullyFunded(job) ? "This job is paid in full, so approving sends them to a checkout for the " + pcMoney(pv.balanceOwed) + " difference right away." : "Nothing extra is charged today — the balance they settle at the end becomes " + pcMoney(pv.balanceOwed) + ".")
                : "Same total as before — this just re-itemises the quote."}</P>
            {pvPayout != null ? <MoneyRow label="Your payout after commission" value={pcMoney(pvPayout)} top strong /> : null}
          </Panel>
        ) : null}
        <Field label="Reason for the change" multiline placeholder="e.g. found a cracked pipe behind the wall" value={rf.reason} onChangeText={(v) => patch({ reason: v })} />
        <Button loading={busy} onPress={() => void send()}>Send revised estimate</Button>
        <Button variant="ghost" disabled={busy} onPress={() => setOpen(false)}>Cancel</Button>
      </View>
    </Anchor>
  );
}
