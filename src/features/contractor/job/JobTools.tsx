// On-job tools, contractor side (PLAN 5.7): ports of web JobTimer.tsx,
// JobChecklist.tsx and JobExpenses.tsx. Same tables and RPCs; every read has three
// outcomes, and a failed read shows "couldn't load", never a confident 0m / $0.
//
// MONEY: display only. The timer's "≈ $" line and the bill prefill are web's own
// arithmetic (hours × the pro's own hourly rate, rounded to 15 min); the bill only
// PREFILLS the price-change form, which the server validates. The expenses box's
// payout figure is the stored `contractor_payout` when the job has been charged,
// else the commission from platformRates — never web's hard-coded 93 (a web
// inconsistency with its own "never hardcode a rate" rule; reported).
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Button, Field, Ic, Txt, rgba, ui, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { suggestedChecklist } from "@/lib/checklistTemplates";
import { getCommissionRate } from "@/lib/platformRates";
import { LinkButton, Tick } from "@/features/request/pieces";
import { moneyInput } from "../bid";
import { PanelHead, defer } from "./parts";

function Box({ children, hot }: { children: React.ReactNode; hot?: boolean }) {
  const { t } = useTheme();
  return (
    <View style={{ marginTop: t.s4, padding: t.s4, gap: t.s2, borderRadius: t.r3, backgroundColor: rgba(t.fg, 0.03), borderWidth: t.hairW, borderColor: hot ? rgba(t.accentRgb, 0.4) : rgba(t.fg, 0.08) }}>
      {children}
    </View>
  );
}

// ── JobTimer ─────────────────────────────────────────────────────────────────
export function JobTimer({ job, hourlyRate, onBill, onError }: {
  job: any; hourlyRate: number | null; onBill: (amount: number | null, reason: string) => void; onError: (m: string) => void;
}) {
  const { t } = useTheme();
  const [logs, setLogs] = useState<any[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("job_time_logs").select("*").eq("job_id", job.id).order("started_at", { ascending: true });
      if (error) { setLoadFailed(true); return; }
      setLoadFailed(false);
      setLogs(data ?? []);
    } catch { setLoadFailed(true); }
  }, [job.id]);
  useEffect(() => { defer(load); }, [load]);

  const running = logs.find((l) => !l.ended_at) ?? null;
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [running?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- restart only when the running log changes

  const totalMs = logs.reduce((s, l) => s + Math.max(0, (l.ended_at ? new Date(l.ended_at).getTime() : now) - new Date(l.started_at).getTime()), 0);
  const hours = totalMs / 3600000;
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? h + "h " + String(m).padStart(2, "0") + "m" : m + "m " + String(s % 60).padStart(2, "0") + "s";
  };
  const hoursText = () => {
    const h = Math.floor(totalMs / 3600000), m = Math.round((totalMs % 3600000) / 60000);
    return (h > 0 ? h + "h " : "") + m + "m";
  };
  const roundedH = Math.round(hours * 4) / 4; // web: bill to the nearest 15 min

  const start = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("start_job_timer", { p_job_id: job.id });
    setBusy(false);
    if (error) { onError("Couldn't start the timer: " + error.message); return; }
    setLogs((p) => [...p, { id: data, job_id: job.id, started_at: new Date().toISOString(), ended_at: null }]);
  };
  const stop = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("stop_job_timer", { p_job_id: job.id });
    setBusy(false);
    if (error) { onError("Couldn't stop the timer: " + error.message); return; }
    const now = new Date().toISOString();
    setLogs((p) => p.map((l) => (l.ended_at ? l : { ...l, ended_at: now })));
  };
  const bill = () => {
    const rate = hourlyRate != null ? Number(hourlyRate) : null;
    const amount = rate != null ? Math.round(roundedH * rate * 100) / 100 : null;
    onBill(amount, hoursText() + " on site" + (rate != null ? " × $" + rate + "/h" : " (tracked time)"));
  };

  return (
    <Box hot={!!running}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.s3 }}>
        <View style={{ flex: 1, gap: t.s1 }}>
          <PanelHead icon="timer">TIME ON SITE</PanelHead>
          {loadFailed ? <Txt size={0.82} color={rgba(t.muted, 0.7)}>{"Couldn't load your tracked time"}</Txt> : (
            <Txt variant="bodyBold" size={1} color={running ? t.accent500 : t.text}>{(totalMs > 0 || running ? fmt(totalMs) : "0m") + (running ? "  ● tracking…" : "")}</Txt>
          )}
        </View>
        {!loadFailed ? (running
          ? <Button variant="danger" loading={busy} onPress={() => void stop()}>Stop timer</Button>
          : <Button loading={busy} onPress={() => void start()}>Start timer</Button>) : null}
      </View>
      {loadFailed ? (
        <View style={{ gap: t.s1 }}>
          <Txt size={0.78} lh={1.5} color={rgba(t.muted, 0.6)}>{"We couldn't read your tracked time just now, so we're not showing a number rather than showing the wrong one."}</Txt>
          <LinkButton onPress={() => void load()}>Try again</LinkButton>
        </View>
      ) : (
        <Txt size={0.78} lh={1.5} color={rgba(t.muted, 0.6)}>
          {hourlyRate != null
            ? "At your rate of $" + hourlyRate + "/h, " + hoursText() + " tracked ≈ $" + (Math.round(roundedH * Number(hourlyRate) * 100) / 100).toFixed(2) + ". The client can see tracked time on their side."
            : "Track your time on site — set an hourly rate in your Account to bill from it. The client can see tracked time on their side."}
        </Txt>
      )}
      {/* Billing is off once money has moved or is frozen (propose_price_change rejects both). */}
      {!loadFailed && !running && totalMs > 60000 && job.payment_status !== "released" && job.payment_status !== "disputed" && !job.is_milestone ? (
        <Button onPress={bill}>{"Bill for tracked time" + (hourlyRate != null ? " (" + hoursText() + " × $" + hourlyRate + "/h)" : "")}</Button>
      ) : null}
    </Box>
  );
}

// ── JobChecklist ─────────────────────────────────────────────────────────────
type Item = { text: string; done: boolean };
export function JobChecklist({ job, onError }: { job: any; onError: (m: string) => void }) {
  const { t } = useTheme();
  const [items, setItems] = useState<Item[]>(() => (Array.isArray(job.checklist) ? job.checklist.map((i: any) => ({ text: String(i?.text ?? ""), done: !!i?.done })) : []));
  const [newText, setNewText] = useState("");
  const [open, setOpen] = useState(items.length > 0);

  const save = async (next: Item[]) => {
    const prev = items;
    setItems(next);
    const { error } = await supabase.rpc("set_job_checklist", { p_job_id: job.id, p_checklist: next.length ? next : null });
    if (error) { setItems(prev); onError("Couldn't save the checklist: " + error.message); }
  };
  const addItem = () => {
    const s = newText.trim();
    if (!s) return;
    if (items.length >= 40) { onError("Checklists are capped at 40 items."); return; }
    setNewText("");
    void save([...items, { text: s, done: false }]);
  };
  const doneCount = items.filter((i) => i.done).length;

  return (
    <Box>
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.s2 }}>
        <View style={{ flex: 1 }}><PanelHead icon="clipboard-list">{"ON-SITE CHECKLIST" + (items.length ? " — " + doneCount + "/" + items.length + " DONE" : "")}</PanelHead></View>
        {items.length > 0 ? <LinkButton onPress={() => setOpen((o) => !o)}>{open ? "Hide" : "Show"}</LinkButton> : null}
      </View>
      {items.length > 0 ? (
        <View style={{ height: ui.meterH, borderRadius: ui.pill, backgroundColor: rgba(t.fg, 0.07), overflow: "hidden" }}>
          <View style={{ height: "100%", width: (doneCount / items.length) * 100 + "%", backgroundColor: doneCount === items.length ? t.success : t.accent500 }} />
        </View>
      ) : (
        <View style={{ gap: t.s2 }}>
          <Txt size={0.8} lh={1.5} color={rgba(t.muted, 0.6)}>Work through a checklist on site so nothing gets missed — fewer callbacks, fewer disputes. Start from a list curated for your trade, then make it yours.</Txt>
          <Button onPress={() => { void save(suggestedChecklist(job.request?.service_needed).map((text) => ({ text, done: false }))); setOpen(true); }}>Load suggested checklist</Button>
        </View>
      )}
      {open ? items.map((it, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: t.s2 }}>
          <View style={{ flex: 1 }}>
            <Tick checked={it.done} onChange={() => void save(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} label={it.text}>
              <Txt size={0.86} lh={1.45} color={it.done ? rgba(t.muted, 0.5) : t.text} style={{ textDecorationLine: it.done ? "line-through" : "none" }}>{it.text}</Txt>
            </Tick>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={"Remove " + it.text} onPress={() => void save(items.filter((_, j) => j !== i))}
            style={{ minWidth: t.hCtl, minHeight: t.hCtl, alignItems: "center", justifyContent: "center" }}>
            <Ic name="x-circle" size={ui.icon.lg} color={rgba(t.muted, 0.5)} />
          </Pressable>
        </View>
      )) : null}
      {open ? (
        <View style={{ flexDirection: "row", gap: t.s2, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}><Field label="Add an item" value={newText} onChangeText={setNewText} onSubmitEditing={addItem} returnKeyType="done" /></View>
          <Button onPress={addItem}>Add</Button>
        </View>
      ) : null}
    </Box>
  );
}

// ── JobExpenses ──────────────────────────────────────────────────────────────
type Expense = { id: string; job_id: string; label: string; amount: number; created_at: string };
export function JobExpenses({ job, userId, onError }: { job: any; userId: string; onError: (m: string) => void }) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Expense[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [commission, setCommission] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("job_expenses").select("*").eq("job_id", job.id).order("created_at", { ascending: false });
    if (error) { setFailed(true); return; }
    setFailed(false);
    setItems((data ?? []) as Expense[]);
  }, [job.id]);
  useEffect(() => { defer(load); }, [load]);
  useEffect(() => { void getCommissionRate().then((r) => { if (r.ok) setCommission(r.rate); }); }, []);

  const total = (items ?? []).reduce((s, e) => s + Number(e.amount || 0), 0);
  // The stored payout always wins; the estimate needs a readable rate (web netPayout).
  const payout = job.contractor_payout != null ? Number(job.contractor_payout)
    : job.amount != null && Number(job.amount) > 0 && commission != null ? Math.round(Number(job.amount) * (1 - commission) * 100) / 100 : null;

  const add = async () => {
    const amt = Number(amount);
    if (!label.trim()) { onError("Give the expense a name (e.g. “Paint + supplies”)."); return; }
    if (!(amt > 0)) { onError("Enter the amount you spent."); return; }
    setBusy(true);
    const { data, error } = await supabase.from("job_expenses").insert({ job_id: job.id, contractor_id: userId, label: label.trim(), amount: amt }).select().maybeSingle();
    setBusy(false);
    if (error || !data) { onError("Couldn't save the expense: " + (error?.message ?? "unknown error")); return; }
    setItems((p) => [data as Expense, ...(p ?? [])]);
    setLabel(""); setAmount("");
  };
  const remove = async (id: string) => {
    const { data: rows, error } = await supabase.from("job_expenses").delete().eq("id", id).select("id");
    if (error) { onError("Couldn't remove the expense: " + error.message); return; }
    if (!rows || rows.length === 0) { onError("Couldn't remove the expense. Pull down to refresh and try again."); return; }
    setItems((p) => (p ?? []).filter((e) => e.id !== id));
  };

  if (failed) {
    return (
      <View style={{ marginTop: t.s4, gap: t.s1 }}>
        <Txt size={0.8} color={rgba(t.muted, 0.6)}>{"Couldn't load your job costs."}</Txt>
        <LinkButton onPress={() => void load()}>Try again</LinkButton>
      </View>
    );
  }
  if (items === null) return null; // still loading: a link that would read "+ Log job costs" before we know is a guess
  if (!open) {
    return (
      <View style={{ marginTop: t.s3 }}>
        <LinkButton onPress={() => setOpen(true)}>{items.length > 0 ? "Job costs: $" + total.toFixed(2) + " (" + items.length + ") — view / add" : "+ Log job costs (materials, rentals…)"}</LinkButton>
      </View>
    );
  }
  return (
    <Box>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Txt variant="bodyMedium" size={0.86} style={{ flex: 1 }}>Job costs</Txt>
        <LinkButton onPress={() => setOpen(false)}>Close</LinkButton>
      </View>
      <Txt size={0.74} lh={1.5} color={rgba(t.muted, 0.55)}>Private to you — the client never sees this. Log materials, rentals and other costs to track your real profit.</Txt>
      {items.map((e) => (
        <View key={e.id} style={{ flexDirection: "row", alignItems: "center", gap: t.s2, borderBottomWidth: t.hairW, borderBottomColor: rgba(t.fg, 0.06) }}>
          <Txt size={0.84} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>{e.label}</Txt>
          <Txt size={0.84} color={rgba(t.muted, 0.75)}>{"$" + Number(e.amount).toFixed(2)}</Txt>
          <Pressable accessibilityRole="button" accessibilityLabel={"Remove " + e.label} onPress={() => void remove(e.id)}
            style={{ minWidth: t.hCtl, minHeight: t.hCtl, alignItems: "center", justifyContent: "center" }}>
            <Ic name="x-circle" size={ui.icon.lg} color={rgba(t.dangerRgb, 0.7)} />
          </Pressable>
        </View>
      ))}
      <Field label="What was it?" placeholder="e.g. Paint + supplies" maxLength={120} value={label} onChangeText={setLabel} />
      <Field label="Amount $" keyboardType="decimal-pad" value={amount} onChangeText={(v) => setAmount(moneyInput(v))} />
      <Button loading={busy} onPress={() => void add()}>Add cost</Button>
      {items.length > 0 || payout != null ? (
        <Txt size={0.8} lh={1.55} color={rgba(t.muted, 0.7)}>
          {"Costs so far: $" + total.toFixed(2) + (payout != null ? " · Your payout: $" + payout.toFixed(2) + " · Est. profit: $" + (payout - total).toFixed(2) : "")}
        </Txt>
      ) : null}
    </Box>
  );
}
