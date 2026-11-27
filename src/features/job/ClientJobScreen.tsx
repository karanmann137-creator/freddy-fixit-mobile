// Job detail for a CLIENT (PLAN step 4.7): the job card of web ClientDashboard
// (~lines 2950-3530), as its own screen. Route: /client/job/[id]?focus=<anchor>.
//
// ⚠️ MONEY SURFACE (gate G4b). What this screen does and does not do:
//   · It calls only existing RPCs and edge functions, with web's arguments.
//     It touches NONE of the four payout guards: confirm_job_completion() is
//     CALLED (guard 1, which raises with the balance owed: shown verbatim) and
//     release-payment is CALLED after it exactly as web does (guard 3, which
//     409s on !fully_funded); auto_confirm_stale_jobs and reconcile-payouts are
//     server-side and unread here. No amount is computed for a charge.
//   · PAYING (deposit, balance, a price top-up) needs web change E2 (checkout
//     returns to the app). Until then each Pay button opens this job on the
//     website and says so. The buttons are enabled and disabled for EXACTLY the
//     reasons web's are (payGates.ts), and a tap while blocked says why.
//   · contractBlocked starts TRUE: it is derived from the gate read, and only a
//     positive contract_signed() clears it. A failed check says "couldn't verify".
//   · <ContractPanel> is mounted on every job, above the money (check-rules mount).
//
// Every read here is three-outcome; an attention row lands on the control it
// names (anchors.tsx); at most one primary (orange) button: the control for the
// top attention row, from the SAME jobStageRows array the Requests tab shows.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, type HostInstance, type ScrollViewInstance } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  Button, Card, DeadEnd, Field, Group, Ic, Pill, Row, Screen, ScreenHeader, SkRow, Txt, askConfirm, notify, rgba, ui, useDelayed, useTheme,
  type IconName,
} from "@/kit";
import { supabase } from "@/lib/supabase";
import { jobFunded, addressMissing, autopayNoteText, estimateJobTotal } from "@/lib/jobRules";
import { jobFullyFunded, jobRefunded } from "@/lib/jobFunding";
import { pcRateLabel } from "@/lib/priceChange";
import { CONTRACT_COPY_FAILED, sendContractCopy } from "@/lib/contractCopy";
import { requestCompletionThanks } from "@/lib/completionPrompt";
import { Tick, LinkButton } from "@/features/request/pieces";
import { useClientData } from "@/features/client/data";
import { balanceFigure, formatWhen, jobStageRows } from "@/features/client/rules";
import { openOnWeb, webJobPath } from "@/features/client/web";
import { AnchorProvider, Anchor, isJobAnchor, useAnchorHost, type JobAnchorId } from "./anchors";
import { contractBlockedBy, contractCheckFailed, invokeReason, readClientJob, type ClientJob, type ClientJobRead } from "./reads";
import { setReleaseNote, useReleaseNote } from "./releaseNotes";
import { ContractPanel } from "./ContractPanel";
import { ConfirmAddress } from "./ConfirmAddress";
import { JobTimeline } from "./JobTimeline";
import { JobPhotos } from "./JobPhotos";
import { PriceChangePanel, PriceHikePanel, QuoteBreakdown } from "./PricePanels";
import { balanceDisabled, balanceOwedPanel, confirmDisabled, contractNote, depositDisabled, moneyIn, payRefusal } from "./payGates";

const STATUS: Record<string, { label: string; tone: "accent" | "good" | "warn" | "danger" | "neutral" }> = {
  assigned: { label: "Pro picked", tone: "neutral" },
  scheduled: { label: "Booked", tone: "neutral" },
  in_progress: { label: "Work started", tone: "neutral" },
  pending_confirmation: { label: "Marked done", tone: "neutral" },
  completed: { label: "Done", tone: "good" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const when = (iso: string | null | undefined) => formatWhen(iso);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function ClientJobScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; focus?: string | string[] }>();
  const id = one(params.id) ?? "";
  const focusParam = one(params.focus);
  const [read, setRead] = useState<ClientJobRead | { kind: "loading" }>({ kind: "loading" });
  const seq = useRef(0);
  const shown = useRef(false); // a job is on screen: a failed refresh keeps it
  const showSkeleton = useDelayed();
  const { reload: reloadClient } = useClientData();

  const load = useCallback(async () => {
    if (!id) { setRead({ kind: "missing" }); return; }
    const mine = ++seq.current;
    const r = await readClientJob(id);
    if (mine !== seq.current) return;
    // A failed REFRESH keeps the job on screen (web jobLoadFailed): the person may be mid-signature.
    if (r.kind === "error" && shown.current) { notify("Couldn't refresh this job. Pull down to try again.", "danger"); return; }
    shown.current = r.kind === "ok";
    setRead(r);
  }, [id]);

  // Every time the screen is shown: first open, back from the claim form, back from the website.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Realtime: keep status/payment live as the pro acts (web subscribes the same way).
  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel("clientjob:" + id)
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `id=eq.${id}` }, (payload) => {
        const row = payload.new as { id?: string } | null;
        if (!row?.id) return;
        setRead((r) => (r.kind === "ok" && r.value.job.id === row.id ? { kind: "ok", value: { ...r.value, job: { ...r.value.job, ...row } } } : r));
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [id]);

  useEffect(() => { if (read.kind === "signedOut") router.replace("/"); }, [read.kind]);

  if (read.kind === "error") return <DeadEnd msg="We couldn't load this job. Check your connection, then try again." onRetry={() => { setRead({ kind: "loading" }); void load(); }} />;
  if (read.kind === "missing") {
    return <DeadEnd msg="We couldn't find this job on your account." retry={false}
      alt={<Button onPress={() => (router.canGoBack() ? router.back() : router.replace("/client"))}>Back to your requests</Button>} />;
  }
  if (read.kind !== "ok") {
    return (
      <Screen>
        <ScreenHeader title="Your job" />
        {showSkeleton ? <View><SkRow /><SkRow /><SkRow /></View> : null}
      </Screen>
    );
  }
  return <JobBody data={read.value} focusParam={focusParam} reload={load} reloadClient={reloadClient} patchJob={(p) => setRead((r) => (r.kind === "ok" ? { kind: "ok", value: { ...r.value, job: { ...r.value.job, ...p } } } : r))} />;
}

function JobBody({ data, focusParam, reload, reloadClient, patchJob }: {
  data: ClientJob; focusParam: string | undefined; reload: () => Promise<void>; reloadClient: () => Promise<void>; patchJob: (p: Record<string, unknown>) => void;
}) {
  const { t } = useTheme();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const contentRef = useRef<HostInstance>(null);
  const host = useAnchorHost(scrollRef, contentRef);
  const job = data.job;
  const releaseNote = useReleaseNote(job.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [selAddons, setSelAddons] = useState<number[]>([]);
  const [showResched, setShowResched] = useState(false);
  const [reschedNote, setReschedNote] = useState("");
  const [confirmErr, setConfirmErr] = useState<string | null>(null);
  // The clock, read once per open (a render must be pure). The 24h lock and the
  // re-post date are explanations only: the RPCs are the authority.
  const [now] = useState(() => Date.now());

  // ── The gate. Fail CLOSED: blocked unless contract_signed() said exactly true. ──
  const contractBlocked = contractBlockedBy(data.gate);
  const checkFailed = contractCheckFailed(data.gate);

  // The SAME rows the Requests tab shows; the top one owns the screen's only primary button.
  const rows = jobStageRows({ job, gate: data.gate, repostBlock: data.repostBlock, releaseNote, feeRate: data.feeRate, waived: data.waived });
  const inSchedBlock = (job.status === "scheduled" || job.status === "in_progress") && !job.is_milestone;
  const inConfirmBlock = job.status === "pending_confirmation" && !job.is_milestone;
  const depositShown = ((inSchedBlock && job.payment_status !== "refunded") || inConfirmBlock) && !moneyIn(job) && !!job.amount;
  const plainConfirmShown = inConfirmBlock && !moneyIn(job) && !job.amount;
  const top = rows[0];
  const primaryKey: string | null = top
    ? (top.key === "release" ? (releaseNote?.kind === "balance" ? "balance" : null) : top.key === "hike" ? "sched" : top.key)
    : depositShown ? "deposit" : plainConfirmShown ? "confirm" : null;
  const isPrimary = (k: string) => primaryKey === k;

  // Land on the control the attention row named, once, after the first paint.
  const focused = useRef(false);
  const focusTo = host.focus;
  useEffect(() => {
    if (focused.current || !isJobAnchor(focusParam)) return;
    const target: JobAnchorId = focusParam;
    // Wait for the panels to lay out before measuring (web: a frame + 60ms).
    const h = setTimeout(() => { focused.current = true; focusTo(target); }, 350);
    return () => clearTimeout(h);
  }, [focusParam, focusTo]);

  const owed = balanceFigure(job, data.feeRate, data.waived);
  const refresh = async () => { await reload(); };
  const afterChange = async () => { await reload(); void reloadClient(); };
  const leaveToRequests = async () => { await reloadClient(); if (router.canGoBack()) router.back(); else router.replace("/client"); };

  // ── Paying: on the website until E2. Same gates, same refusals as web's handlers. ──
  const payOnWeb = async (what: "deposit" | "balance") => {
    const no = payRefusal(job, contractBlocked, checkFailed, what);
    if (no) {
      notify(no, "danger");
      if (what === "deposit" && !contractBlocked && addressMissing(job)) host.focus("address");
      return;
    }
    await openOnWeb(webJobPath(job.id));
    await afterChange(); // the webhook, not the return, is proof of payment: re-read the job
  };

  const setAutopay = async (on: boolean) => {
    setBusy("autopay");
    const { error } = await supabase.rpc("set_job_autopay", { p_job_id: job.id, p_on: on });
    setBusy(null);
    if (error) { notify("Couldn't change that: " + error.message, "danger"); return; }
    patchJob({ autopay_balance: on, ...(on ? { autopay_last_error: null, autopay_attempts: 0 } : {}) });
    notify(on ? "Automatic payment is back on — we'll charge your saved card." : "Automatic payment is off. You can pay the balance yourself below.");
    void reload();
  };

  // ── Price change (held job) ──
  const approvePrice = async (payNow: boolean) => {
    if (payNow) { await openOnWeb(webJobPath(job.id)); await afterChange(); return; }
    setBusy("price");
    try {
      const { data: d, error } = await supabase.functions.invoke("adjust-payment", { body: { job_id: job.id } });
      const reason = await invokeReason(error, d, "Something went wrong.");
      if (reason) { notify("Couldn't apply the price change: " + reason, "danger"); return; }
      const res = d as { mode?: string; url?: string } | null;
      if (res?.mode === "topup" && res.url) {
        // The server opened a checkout for the difference (we expected no charge). It is
        // Stripe's own page; finish it there. Proof of payment is the job row, re-read below.
        notify("There's a difference to pay. Finish it in the secure checkout that just opened.");
        await WebBrowser.openBrowserAsync(res.url).catch(() => notify("Couldn't open the checkout. Pay it from this job on freddyfixit.ca.", "danger"));
      }
      await afterChange();
    } catch (e) {
      notify("Couldn't apply the price change: " + String((e as Error)?.message ?? e), "danger");
    } finally { setBusy(null); }
  };
  const declinePrice = async () => {
    if (!(await askConfirm({ title: "Decline the price change?", message: "Your pro's proposed new price won't be applied — the current agreed price stays in place.", confirmLabel: "Yes, decline", danger: false }))) return;
    setBusy("price");
    const { error } = await supabase.rpc("decline_price_change", { p_job_id: job.id });
    setBusy(null);
    if (error) { notify("Couldn't decline: " + error.message, "danger"); return; }
    patchJob({ price_change_pending: null });
    void afterChange();
  };
  const declineReopen = async () => {
    if (!(await askConfirm({ title: "Decline & re-open to other pros?", message: "This cancels this contractor's job and re-opens your request. You'll be able to choose from the other pros who bid. This can't be undone.", confirmLabel: "Decline & re-open", danger: true }))) return;
    setBusy("sched");
    const { error } = await supabase.rpc("decline_price_reopen", { p_job_id: job.id });
    setBusy(null);
    if (error) { notify("Couldn't re-open the job: " + error.message, "danger"); return; }
    notify("Re-opened. Choose from the other pros on your request.");
    await leaveToRequests();
  };

  // ── Schedule proposal ──
  const approveSchedule = async () => {
    if (busy) return;
    setBusy("sched");
    try {
      const { error } = await supabase.rpc("approve_job_schedule", { p_job_id: job.id, p_selected_items: selAddons.length ? selAddons : null });
      if (error) { notify("Couldn't approve: " + error.message, "danger"); return; }
      // The written contract copy starts the Alberta 10-day clock. Retries inside; never blocks the approval.
      void sendContractCopy(job.id).then((ok) => { if (!ok) notify(CONTRACT_COPY_FAILED, "neutral"); });
      // A prepaid recurring pool covers this visit: draw one down now (web, inside the busy window).
      try { await supabase.rpc("consume_prepaid_occurrence", { p_job: job.id }); } catch { /* no pool: the normal pay flow follows */ }
      setSelAddons([]);
      await afterChange(); // the server applied the add-ons; the app re-reads, it doesn't re-add them
    } finally { setBusy(null); }
  };
  const submitReschedule = async () => {
    const note = reschedNote.trim();
    if (!note) return;
    setBusy("resched");
    const { error } = await supabase.from("messages").insert({ job_id: job.id, sender_id: data.userId, content: "Reschedule request: " + note });
    setBusy(null);
    if (error) { notify("Couldn't send your request: " + error.message, "danger"); return; }
    setShowResched(false);
    setReschedNote("");
    notify("Sent! Your contractor will see your suggested time and propose a new one.");
  };

  // ── Walkthrough, visit ──
  const approveWalkthrough = async () => {
    setBusy("walkthrough");
    const { error } = await supabase.rpc("approve_walkthrough", { p_job_id: job.id });
    setBusy(null);
    if (error) { notify("Couldn't confirm the walkthrough: " + error.message, "danger"); return; }
    notify("Walkthrough confirmed — your pro will come take a look. It's free.");
    void afterChange();
  };
  const declineWalkthrough = async () => {
    if (!(await askConfirm({ title: "Decline this walkthrough time?", message: "Your pro will be asked to propose another time or send an estimate without a visit.", confirmLabel: "Yes, decline the time", danger: false }))) return;
    setBusy("walkthrough");
    const { error } = await supabase.rpc("decline_walkthrough", { p_job_id: job.id, p_reason: null });
    setBusy(null);
    if (error) { notify("Couldn't decline: " + error.message, "danger"); return; }
    void afterChange();
  };
  const confirmVisit = async () => {
    setBusy("visit");
    const { error } = await supabase.rpc("confirm_visit", { p_job_id: job.id });
    setBusy(null);
    if (error) { notify("Couldn't confirm: " + error.message, "danger"); return; }
    void afterChange();
  };
  // Web: mirrors client_reschedule_visit's 24h guard so the screen explains itself. The RPC is the authority.
  const visitLocked = !!job.scheduled_at && !contractBlocked && new Date(job.scheduled_at).getTime() - now < 24 * 3600 * 1000;

  // ── Re-post (the 7-day escape hatch; job_repost_block is the server's answer) ──
  const repostJob = async () => {
    if (!(await askConfirm({ title: "Put this job back on the board?", message: "This cancels the job with your current pro and re-posts your request as a fresh job other pros can bid on. Your pro will be told. This can't be undone.", confirmLabel: "Re-post my job", danger: true }))) return;
    setBusy("repost");
    const { data: d, error } = await supabase.rpc("repost_job", { p_job_id: job.id });
    setBusy(null);
    if (error) { notify("Couldn't re-post the job: " + error.message, "danger"); return; }
    const r = (d ?? {}) as { refired?: boolean; reach?: number };
    notify(r.refired ? "Re-posted. " + Number(r.reach || 0) + " pros have been notified." : "Re-posted. Your request is back on the board.");
    await leaveToRequests();
  };

  // ── Confirm completion (guard 1 raises with the balance owed: shown verbatim) ──
  const confirmCompletion = async () => {
    const willRelease = job.payment_status === "held";
    if (!(await askConfirm({
      title: willRelease ? "Confirm & release payment?" : "Confirm completion?",
      message: willRelease
        ? "This releases your held payment to the contractor and closes the job. Only do this once you're satisfied the work is done."
        : "This marks the job as done and closes it out. Only do this once you're satisfied the work is done.",
      confirmLabel: willRelease ? "Yes, release payment" : "Yes, confirm",
      danger: false,
    }))) return;
    setBusy("confirm");
    setConfirmErr(null);
    const { error } = await supabase.rpc("confirm_job_completion", { p_job_id: job.id });
    if (error) {
      setBusy(null);
      setConfirmErr("Couldn't confirm: " + error.message);
      notify("Couldn't confirm: " + error.message, "danger");
      return;
    }
    try {
      const ref = await supabase.rpc("get_my_referral");
      const rv = ref.error ? null : (ref.data as { code?: string | null; code_status?: string | null } | null);
      await requestCompletionThanks({ jobId: job.id, code: rv?.code, codeStatus: rv?.code_status });
    } catch { /* the confirmation stands; the ask is a bonus */ }
    if (willRelease) {
      // Try to release now. If it doesn't land, reconcile-payouts retries every 15 min.
      // The three branches are keyed on the JOB's funding, never on the error's wording
      // (except the payout-setup case, which web also reads from the reason).
      try {
        const body = job.prepayment_id ? { prepayment_id: job.prepayment_id, job_id: job.id } : { job_id: job.id };
        const { data: d, error: e } = await supabase.functions.invoke("release-payment", { body });
        const reason = await invokeReason(e, d, "release failed");
        if (reason) {
          const r = reason.toLowerCase();
          if (!jobFullyFunded(job)) {
            const tx = "The remaining " + (owed != null ? "$" + owed.toFixed(2) : "balance") + " on this job still needs to be paid before the payment can be released. Nothing is lost — pay it below and it completes.";
            setReleaseNote(job.id, { kind: "balance", text: tx });
            notify("Job confirmed — but " + tx.charAt(0).toLowerCase() + tx.slice(1), "danger");
          } else if (r.includes("payout setup") || r.includes("connect") || r.includes("onboard")) {
            const tx = "Your contractor hasn't finished their payout setup yet, so your payment stays held until they do — we've let them know. Nothing is lost and nothing more is owed by you.";
            setReleaseNote(job.id, { kind: "payout", text: tx });
            notify("Job confirmed. " + tx, "neutral");
          } else {
            const tx = "Your payment is complete and nothing more is owed by you. Sending it on to your contractor is taking a little longer than usual — that happens automatically, and we're watching it.";
            setReleaseNote(job.id, { kind: "delayed", text: tx });
            notify("Job confirmed. " + tx);
          }
        } else {
          setReleaseNote(job.id, null);
          notify("Job confirmed and payment released. Thanks!");
        }
      } catch {
        notify("Job confirmed. The payment is being processed and will complete automatically — nothing more for you to do.");
      }
    } else {
      notify("Job confirmed. Thanks!");
    }
    setBusy(null);
    await afterChange();
  };

  // ── Pieces ──
  const contractWarn = (what: "deposit" | "balance") => contractBlocked
    ? <Say icon="alert-triangle" color={t.warn}>{contractNote(checkFailed, what)}</Say> : null;

  const autopay = (whenText: string) => {
    if (!job.stripe_payment_method_id || owed == null) return null;
    const text = autopayNoteText(job, whenText, owed);
    if (!text) return null;
    const failed = !!job.autopay_last_error;
    return (
      <View>
        <Say icon={failed ? "alert-triangle" : "dollar"} color={failed ? t.warn : rgba(t.muted, 0.8)}>{text}</Say>
        {!failed ? <LinkButton onPress={() => { if (busy !== "autopay") void setAutopay(!job.autopay_balance); }}>{job.autopay_balance ? "Turn off automatic payment" : "Turn it back on"}</LinkButton> : null}
      </View>
    );
  };

  const balancePanel = (doneNow: boolean) => (
    <Card style={{ padding: t.s4, marginTop: t.s3, borderColor: rgba(t.accentRgb, 0.18), backgroundColor: rgba(t.accentRgb, 0.08) }}>
      <Say icon="check-circle" color={t.success}>{"Deposit of $" + jobFunded(job).toFixed(2) + (doneNow ? " already paid." : " paid — your pro is booked in.")}</Say>
      <Txt size={0.84} lh={1.5} color={rgba(t.muted, 0.85)} style={{ marginTop: t.s2 }}>
        {doneNow
          ? "Your pro has finished, so the remaining " + (owed != null ? "$" + owed.toFixed(2) : "balance") + " is now due. It's held securely alongside your deposit — nothing reaches your contractor until you confirm the work below."
          : "The remaining " + (owed != null ? "$" + owed.toFixed(2) : "balance") + " is due once the work is finished — you can pay it now or wait until then. It's held securely with your deposit, and everything is released to your contractor only after you confirm the job is done."}
      </Txt>
      {autopay(doneNow ? "shortly" : "once your pro marks the job complete")}
      {contractWarn("balance")}
      <PayNote />
      <View style={{ marginTop: t.s3 }}>
        <Button full variant={isPrimary("balance") ? "primary" : "secondary"} disabled={balanceDisabled(job, contractBlocked)} onPress={() => void payOnWeb("balance")}>
          {"Pay the remaining " + (owed != null ? "$" + owed.toFixed(2) : "balance") + " on the website"}
        </Button>
      </View>
    </Card>
  );

  const depositPanel = (afterWork: boolean) => {
    const total = job.total_charged != null || data.feeRate != null ? estimateJobTotal(job, data.feeRate ?? 0, data.waived ? job.id : null) : null;
    const feeText = data.waived ? "Your service fee is waived on this job (referral reward)." : data.feeRate != null ? "Total includes a " + pcRateLabel(data.feeRate) + " service fee." : "";
    return (
      <View style={{ marginTop: t.s3 }}>
        {job.payment_status === "failed" ? <Say icon="alert-triangle" color={t.danger}>Your last payment didn’t go through. No charge was made — please try again below.</Say> : null}
        {job.payment_status === "processing" ? <Say icon="alert-triangle" color={t.warn}>You have a checkout already open. If you’ve just paid, give it a moment and pull down to refresh. If you closed it without paying, start a new one below — don’t pay in both.</Say> : null}
        <Txt size={0.84} lh={1.5} color={rgba(t.muted, 0.8)} style={{ marginTop: t.s2 }}>
          {afterWork
            ? "Pay for the job, then confirm. Your payment is held securely and only released to the contractor once you confirm. "
            : "You pay a deposit now to book your pro — the rest is paid once the work is done. Both payments are held securely and only released to the contractor after you confirm. "}
          {feeText}
        </Txt>
        {total != null ? (
          <Row icon="dollar" tone="neutral" title={"$" + total.toFixed(2)} sub="Job total incl. service fee. The website shows what's due now and what's due when the work is done before anything is charged." />
        ) : null}
        {!afterWork ? (
          <Say icon="info" color={rgba(t.muted, 0.8)}>Your pro isn’t dispatched until the deposit is paid. Paying is what books them in and sends them the job — until then the visit isn’t locked. We hold your money the whole time and only release it to the contractor once you’ve confirmed the work is done.</Say>
        ) : null}
        {contractWarn("deposit")}
        <View style={{ marginTop: t.s3 }}>
          <ConfirmAddress job={job} userId={data.userId} primary={isPrimary("address")}
            onConfirmed={(address) => { patchJob({ service_address: address, service_address_at: new Date().toISOString() }); void afterChange(); }} />
        </View>
        <PayNote />
        <View style={{ marginTop: t.s3 }}>
          <Button full variant={isPrimary("deposit") ? "primary" : "secondary"} disabled={depositDisabled(job, contractBlocked)} onPress={() => void payOnWeb("deposit")}>
            {job.payment_status === "processing" ? "Start a new payment on the website" : afterWork ? "Pay for the job on the website" : "Pay the deposit on the website"}
          </Button>
        </View>
      </View>
    );
  };

  const docsRow = <Row icon="download" tone="neutral" title="Invoice / receipt" sub="On freddyfixit.ca" chevron onPress={() => void openOnWeb(webJobPath(job.id))} />;
  const st = STATUS[job.status] ?? { label: String(job.status ?? "—"), tone: "neutral" as const };
  const approvedOrLater = job.client_approved_at || ["scheduled", "in_progress", "pending_confirmation", "completed"].includes(job.status);

  return (
    <AnchorProvider value={host.value}>
      <Screen scrollRef={scrollRef} onRefresh={refresh}>
        <View ref={contentRef} collapsable={false}>
          <ScreenHeader title={job.service_needed || "Your job"} right={<Pill tone={st.tone}>{st.label}</Pill>} />

          <Card>
            <Row icon="user" tone="neutral" title={data.proName || "Your pro"} sub={job.scheduled_at ? when(job.scheduled_at) : "No time agreed yet"} amount={job.amount ? "$" + Number(job.amount).toFixed(2) : undefined} />
          </Card>

          {approvedOrLater ? <JobTimeline job={job} /> : null}

          {/* Every job needs an agreement signed by both sides before any money moves,
              so this sits above the payment block. Never conditionally unmount it. */}
          <Group>
            <ContractPanel job={job} primary={isPrimary("contract")} onUpdated={() => void afterChange()} />
          </Group>

          {job.is_milestone ? (
            <Group label="Stage payments">
              <Card><Row icon="layers" tone="neutral" title="This job is paid in stages" sub="Fund and approve each stage on freddyfixit.ca for now. Stage payments come to the app next." chevron onPress={() => void openOnWeb(webJobPath(job.id))} /></Card>
            </Group>
          ) : null}

          {job.payment_status === "disputed" ? (
            <Card style={{ padding: t.s4, marginTop: t.s4, borderColor: rgba(t.warnRgb, 0.35), backgroundColor: rgba(t.warnRgb, 0.08) }}>
              <Say icon="alert-triangle" color={t.warn} bold>Claim filed — under review</Say>
              <Txt size={0.84} lh={1.55} color={rgba(t.muted, 0.8)} style={{ marginTop: t.s2 }}>Your payment is frozen and protected while our team reviews your claim. The contractor has a few days to respond, then we’ll decide. Nothing has been released to them in the meantime. We’ll email you as soon as it’s resolved.</Txt>
            </Card>
          ) : (
            <View style={{ marginTop: t.s4 }}>
              {job.price_change_pending ? (
                <PriceChangePanel job={job} feeRate={data.feeRate} waived={data.waived} busy={busy === "price"} primary={isPrimary("price")}
                  onApprove={(payNow) => void approvePrice(payNow)} onDecline={() => void declinePrice()} />
              ) : null}

              {job.status === "assigned" && job.client_rescheduled_at && !job.reschedule_accepted_at ? (
                <Block icon="clock" title="Waiting for your pro to accept the new time">
                  {"You asked to move this to " + (job.scheduled_at ? when(job.scheduled_at) : "a new time") + ". Your contractor will accept it or suggest another time for you to approve."}
                </Block>
              ) : null}

              {job.status === "assigned" && job.schedule_proposed_at && !job.client_approved_at && !(job.client_rescheduled_at && !job.reschedule_accepted_at) ? (
                <Anchor id="sched">
                  <View style={{ marginTop: t.s4 }}>
                    {job.price_hike_from != null && Number(job.amount ?? 0) > Number(job.price_hike_from) + 0.005 ? (
                      <PriceHikePanel job={job} feeRate={data.feeRate} waived={data.waived} busy={busy === "sched"} onDeclineReopen={() => void declineReopen()} />
                    ) : null}
                    <Card style={{ padding: t.s4 }}>
                      <Txt variant="bodyBold" size={0.95}>Your contractor proposed a time & price</Txt>
                      <Say icon="calendar" color={rgba(t.muted, 0.8)}>{(job.scheduled_at ? when(job.scheduled_at) : "—") + (job.amount ? " · $" + job.amount : "")}</Say>
                      <QuoteBreakdown row={job} assumptionsKey="quote_assumptions" />
                      {Array.isArray(job.quote_items) && job.quote_items.length > 0 ? (
                        <View style={{ marginTop: t.s3, padding: t.s3, borderRadius: t.r2, borderWidth: ui.line, borderStyle: "dashed", borderColor: rgba(t.accentRgb, 0.35), backgroundColor: rgba(t.accentRgb, 0.05) }}>
                          <Txt variant="label" size={0.74} color={rgba(t.muted, 0.55)}>OPTIONAL ADD-ONS</Txt>
                          <Txt size={0.8} lh={1.45} color={rgba(t.muted, 0.65)} style={{ marginTop: t.s1 }}>Your pro offered these extras. Tick any you’d like — they’re added to the price you approve. Totally optional.</Txt>
                          {job.quote_items.map((it: { label?: string; amount?: number }, idx: number) => (
                            <Tick key={idx} checked={selAddons.includes(idx)} label={(it.label ?? "Add-on") + ", plus $" + Number(it.amount).toFixed(2)}
                              onChange={() => setSelAddons((p) => (p.includes(idx) ? p.filter((i) => i !== idx) : [...p, idx]))}>
                              <View style={{ flexDirection: "row", gap: t.s2 }}>
                                <Txt size={0.86} style={{ flex: 1 }}>{it.label}</Txt>
                                <Txt variant="bodyMedium" size={0.86} color={selAddons.includes(idx) ? t.text : rgba(t.muted, 0.7)}>{"+$" + Number(it.amount).toFixed(2)}</Txt>
                              </View>
                            </Tick>
                          ))}
                        </View>
                      ) : null}
                      {job.notes && /Price update:/.test(job.notes) ? (
                        <Txt size={0.82} lh={1.45} color={t.warn} style={{ marginTop: t.s3 }}>{String(job.notes).split("\n").filter((l: string) => l.startsWith("Price update:")).pop()}</Txt>
                      ) : null}
                      <View style={{ marginTop: t.s4, gap: t.s2 }}>
                        <Button full variant={isPrimary("sched") ? "primary" : "secondary"} loading={busy === "sched"} onPress={() => void approveSchedule()}>Approve & schedule</Button>
                        <Button full variant="ghost" disabled={!!busy} onPress={() => { setReschedNote(""); setShowResched((v) => !v); }}>Request a different time</Button>
                      </View>
                      {showResched ? (
                        <View style={{ marginTop: t.s3 }}>
                          <Txt size={0.82} lh={1.5} color={rgba(t.muted, 0.8)}>Suggest a different day/time. Your contractor gets it as a message and proposes a new time.</Txt>
                          <Field label="Your suggestion" value={reschedNote} onChangeText={setReschedNote} multiline placeholder="e.g. Any weekday after 4pm, or this Saturday morning" />
                          <View style={{ marginTop: t.s3, gap: t.s2 }}>
                            <Button full loading={busy === "resched"} disabled={!reschedNote.trim()} onPress={() => void submitReschedule()}>Send suggestion</Button>
                            <LinkButton onPress={() => setShowResched(false)}>Cancel</LinkButton>
                          </View>
                        </View>
                      ) : null}
                    </Card>
                  </View>
                </Anchor>
              ) : null}

              {job.status === "assigned" && job.walkthrough_proposed_at && !job.walkthrough_approved_at ? (
                <Anchor id="walkthrough">
                  <Card style={{ padding: t.s4, marginTop: t.s4 }}>
                    <Say icon="search" color={t.text} bold>Your pro wants to do a quick walkthrough first</Say>
                    <Txt size={0.84} lh={1.5} color={rgba(t.muted, 0.8)} style={{ marginTop: t.s2 }}>
                      {"They'd like to see the space before giving you a firm price. Proposed visit: " + (job.walkthrough_at ? when(job.walkthrough_at) : "—") + ". The visit is free — nothing is charged. After it, they'll send your estimate to approve."}
                    </Txt>
                    {job.walkthrough_note ? <Txt size={0.82} color={rgba(t.muted, 0.7)} style={{ marginTop: t.s2, fontStyle: "italic" }}>{"“" + job.walkthrough_note + "”"}</Txt> : null}
                    <View style={{ marginTop: t.s4, gap: t.s2 }}>
                      <Button full variant={isPrimary("walkthrough") ? "primary" : "secondary"} loading={busy === "walkthrough"} onPress={() => void approveWalkthrough()}>Confirm the visit</Button>
                      <Button full variant="ghost" disabled={!!busy} onPress={() => void declineWalkthrough()}>That time doesn’t work</Button>
                    </View>
                  </Card>
                </Anchor>
              ) : null}
              {job.status === "assigned" && job.walkthrough_approved_at && !job.walkthrough_done_at ? (
                <Say icon="calendar" color={t.success}>{"Walkthrough booked for " + (job.walkthrough_at ? when(job.walkthrough_at) : "the agreed time") + " — free visit, nothing charged. Your estimate comes after."}</Say>
              ) : null}
              {job.status === "assigned" && job.walkthrough_done_at && !job.schedule_proposed_at ? (
                <Say icon="check-circle" color={rgba(t.muted, 0.75)}>Walkthrough done — your pro is putting your estimate together. You’ll get a notification when it lands.</Say>
              ) : null}

              {job.status === "assigned" && job.slot_released_at && !job.schedule_proposed_at ? (
                <Card style={{ padding: t.s4, marginTop: t.s4, borderColor: rgba(t.warnRgb, 0.35), backgroundColor: rgba(t.warnRgb, 0.08) }}>
                  <Say icon="clock" color={t.warn} bold>Your booked time was released.</Say>
                  <Txt size={0.84} lh={1.55} style={{ marginTop: t.s2 }}>
                    {(job.slot_released_from ? when(job.slot_released_from) + " arrived without the service agreement being signed and paid, so we freed the slot rather than have your pro hold it." : "The service agreement wasn't signed and paid in time, so we freed the slot rather than have your pro hold it.")
                      + " Nothing was cancelled — you still have the same contractor and the same price. They'll propose a new time, and you can approve it as usual. You haven't been charged anything."}
                  </Txt>
                </Card>
              ) : null}

              {job.status === "assigned" && !job.schedule_proposed_at && !job.walkthrough_proposed_at && !job.slot_released_at ? (
                <Anchor id="repost">
                  <View style={{ marginTop: t.s2 }}>
                    <Say icon="check-circle" color={rgba(t.muted, 0.75)}>Matched! Waiting for your contractor to propose a time and price.</Say>
                    {data.repostBlock === null ? (
                      <Card style={{ padding: t.s4, marginTop: t.s3, borderColor: rgba(t.accentRgb, 0.3), backgroundColor: rgba(t.accentRgb, 0.07) }}>
                        <Txt size={0.84} lh={1.55}>Heard nothing from your pro? It’s been over a week since you chose them and there’s still no time or price agreed. You can put your job back on the board as a fresh post and let other pros bid. Nothing has been charged.</Txt>
                        <View style={{ marginTop: t.s3 }}>
                          <Button variant="danger" loading={busy === "repost"} onPress={() => void repostJob()}>Re-post my job</Button>
                        </View>
                      </Card>
                    ) : job.created_at && now - new Date(job.created_at).getTime() < 7 * 86400000 ? (
                      <Txt size={0.78} color={rgba(t.muted, 0.6)} style={{ marginTop: t.s2 }}>
                        {"If you still have no time or price by " + new Date(new Date(job.created_at).getTime() + 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Edmonton", month: "short", day: "numeric" }) + ", you'll be able to re-post your job to other pros from here."}
                      </Txt>
                    ) : null}
                  </View>
                </Anchor>
              ) : null}

              {/* in_progress is the same screen as scheduled: the client still needs the payment block. */}
              {inSchedBlock ? (
                <View style={{ marginTop: t.s2 }}>
                  {job.status === "in_progress"
                    ? <Say icon="check-circle" color={t.success}>{"Your pro has started the work" + (job.amount ? " · $" + job.amount : "") + ". You'll be asked to confirm once they're finished."}</Say>
                    : <Say icon="calendar" color={t.success}>{"Scheduled for " + (job.scheduled_at ? when(job.scheduled_at) : "the agreed time") + (job.amount ? " · $" + job.amount : "") + "."}</Say>}
                  {job.status === "scheduled" ? (
                    <Card style={{ padding: t.s4, marginTop: t.s3 }}>
                      {visitLocked ? (
                        <Say icon="clock" color={t.text}>Your visit is less than 24 hours away. The time is locked in now — your pro has set the day aside for you. If something has come up, message them in the job chat and agree a new time together; it updates automatically once you both do.</Say>
                      ) : job.client_confirmed_visit_at ? (
                        <View>
                          <Say icon="check-circle" color={t.success}>You confirmed this visit.</Say>
                          <LinkButton onPress={() => void openOnWeb(webJobPath(job.id)).then(afterChange)}>Change the time on the website</LinkButton>
                        </View>
                      ) : (
                        <View>
                          <Txt size={0.84} lh={1.5}>Is this time still good? Confirm it, or pick a new day/time. Changes close 24 hours before the visit.</Txt>
                          <View style={{ marginTop: t.s3, gap: t.s2 }}>
                            <Button full loading={busy === "visit"} onPress={() => void confirmVisit()}>Confirm this time</Button>
                            <LinkButton onPress={() => void openOnWeb(webJobPath(job.id)).then(afterChange)}>Change the time on the website</LinkButton>
                          </View>
                        </View>
                      )}
                    </Card>
                  ) : null}
                  {Array.isArray(job.quote_items) && job.quote_items.some((i: { accepted?: boolean }) => i.accepted) ? (
                    <Say icon="sparkles" color={rgba(t.muted, 0.75)}>{"Add-ons included: " + job.quote_items.filter((i: { accepted?: boolean }) => i.accepted).map((i: { label?: string; amount?: number }) => i.label + " (+$" + Number(i.amount).toFixed(2) + ")").join(", ")}</Say>
                  ) : null}
                  <JobPhotos job={job} />
                  {moneyIn(job) ? (
                    <>
                      {balanceOwedPanel(job) ? balancePanel(false) : (
                        <Say icon="check-circle" color={t.success}>Payment secured — we’ll release it to your contractor once you confirm the work is done.</Say>
                      )}
                      <Card style={{ marginTop: t.s3 }}>{docsRow}</Card>
                    </>
                  ) : job.payment_status === "refunded" ? (
                    <>
                      <Say icon="check-circle" color={rgba(t.muted, 0.8)}>
                        {jobRefunded(job) > 0
                          ? "A refund of $" + jobRefunded(job).toFixed(2) + " has been returned to the card you paid with. Nothing further is owed on this job — your bank can take another 5–10 business days to show it."
                          : "This job has been refunded. Nothing further is owed. Your bank can take 5–10 business days to show it."}
                      </Say>
                      <Card style={{ marginTop: t.s3 }}>{docsRow}</Card>
                    </>
                  ) : job.amount ? depositPanel(false) : null}
                </View>
              ) : null}

              {inConfirmBlock ? (
                <Anchor id="confirm">
                  <View style={{ marginTop: t.s4 }}>
                    <Txt variant="bodyBold" size={0.95}>Your contractor marked this complete</Txt>
                    <JobPhotos job={job} />
                    {moneyIn(job) ? (
                      <>
                        {balanceOwedPanel(job) ? balancePanel(true) : (
                          <Txt size={0.84} color={rgba(t.muted, 0.7)} style={{ marginTop: t.s3 }}>Confirm the work is done and we’ll release your held payment to the contractor. If you don’t, it auto-confirms in a few days.</Txt>
                        )}
                        {confirmErr ? <Say icon="alert-triangle" color={t.danger}>{confirmErr}</Say> : null}
                        <View style={{ marginTop: t.s3 }}>
                          <Button full variant={isPrimary("confirm") ? "primary" : "secondary"} loading={busy === "confirm"} disabled={confirmDisabled(job)} onPress={() => void confirmCompletion()}>Confirm & release payment</Button>
                        </View>
                        <Card style={{ marginTop: t.s3 }}>{docsRow}</Card>
                        {/* The client's remedy, on the one screen where they're deciding whether to use it. */}
                        <LinkButton onPress={() => router.push({ pathname: "/client/claim/[id]", params: { id: job.id } })}>Something wrong? File a claim</LinkButton>
                        {balanceOwedPanel(job) ? (
                          <Txt size={0.78} lh={1.5} color={rgba(t.muted, 0.65)}>Pay the balance above to unlock confirming. If something isn’t right with the work, file a claim instead — that freezes everything while we look into it.</Txt>
                        ) : null}
                      </>
                    ) : job.amount ? depositPanel(true) : (
                      <>
                        <Txt size={0.84} color={rgba(t.muted, 0.7)} style={{ marginTop: t.s3 }}>Please confirm the work is done. If you don’t, it auto-confirms in a few days.</Txt>
                        {confirmErr ? <Say icon="alert-triangle" color={t.danger}>{confirmErr}</Say> : null}
                        <View style={{ marginTop: t.s3 }}>
                          <Button full variant={isPrimary("confirm") ? "primary" : "secondary"} loading={busy === "confirm"} disabled={!!job.price_change_pending} onPress={() => void confirmCompletion()}>Confirm completion</Button>
                        </View>
                      </>
                    )}
                  </View>
                </Anchor>
              ) : null}

              {job.status === "completed" ? (
                <Card style={{ marginTop: t.s4 }}>
                  <Row icon="star" tone="neutral" title="Rate your contractor" sub="Out of 10, for price, experience and the end result" chevron
                    onPress={() => router.push({ pathname: "/client/review/[requestId]", params: { requestId: job.request_id } })} />
                  {docsRow}
                </Card>
              ) : null}
            </View>
          )}

          <Group label="Messages">
            <Card>
              {/* TODO: jobChatHref after merge (src/features/chat/routes.ts, phase-7/live-jobs). */}
              <Row icon="message-square" tone="neutral" title="Message your pro" sub="Ask a question or agree a time" chevron onPress={() => router.push(`/client/chat/${job.id}`)} />
            </Card>
          </Group>
        </View>
      </Screen>
    </AnchorProvider>
  );
}

/** Until web change E2, checkout happens on the website. Said once, next to every Pay button. */
function PayNote() {
  const { t } = useTheme();
  return <Txt size={0.78} lh={1.5} color={rgba(t.muted, 0.65)} style={{ marginTop: t.s3 }}>Paying in the app comes in an update. For now this opens your job on freddyfixit.ca, where you sign in and pay securely.</Txt>;
}

function Say({ icon, color, bold, children }: { icon: IconName; color: string; bold?: boolean; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: t.s2, alignItems: "flex-start", marginTop: t.s3 }}>
      <View style={{ marginTop: ui.nudge2 }}><Ic name={icon} size={ui.icon.sm} color={color} /></View>
      <Txt variant={bold ? "bodyBold" : "body"} size={0.86} lh={1.5} color={color === t.text ? t.text : color} style={{ flex: 1 }}>{children}</Txt>
    </View>
  );
}

function Block({ icon, title, children }: { icon: IconName; title: string; children: string }) {
  const { t } = useTheme();
  return (
    <Card style={{ padding: t.s4, marginTop: t.s4 }}>
      <Say icon={icon} color={t.text} bold>{title}</Say>
      <Txt size={0.84} lh={1.5} color={rgba(t.muted, 0.8)} style={{ marginTop: t.s2 }}>{children}</Txt>
    </Card>
  );
}
