// The contractor's half of web components/ContractPanel.tsx (PLAN 5.7, §6.3).
//
// ⚠️ HIGHEST-RISK SURFACE ON THE PLATFORM (web CLAUDE.md "Contracts"). Every job
// needs an e-signed agreement before the client can be charged; the payment
// functions return 428 until it is signed. If this panel is not mounted, the pro
// has no way to send one and the job can never be paid, with no error anywhere.
// check-rules mounts it on the job screen.
//
// FAIL CLOSED: a failed get_job_contract read is the "couldn't load" branch with a
// Try again, NEVER the signed branch and never the compose form (which would offer
// to re-send an agreement that may already be signed). Every branch, loading
// included, renders inside the ONE <Anchor id={CONTRACT_ANCHOR}> below, so "Send
// agreement" always lands here (web: CONTRACT_ANCHOR spread on every branch).
//
// Same RPCs and edge call as web, in web's order: get_job_contract,
// build_contract_body (preview), contract_ready (the fifth reason includes payouts),
// ensureTermsAccepted("sign-contract"), save_contract_draft, contract-sign.
//
// Not ported (judgement): uploading a NEW own document needs a document picker
// (PDF/DOCX), which isn't in the app yet; that path hands off to the website. An
// own document already attached on the website can still be signed here. The
// executed copy is HTML for the print shell; viewing it opens the website.
import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Field, Ic, Row, Card, SkText, Sk, Txt, rgba, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { ensureTermsAccepted } from "@/lib/terms";
import { openOnWeb } from "@/features/client/web";
import { Tick } from "@/features/request/pieces";
import { CONTRACT_ANCHOR } from "../rules";
import { TZ } from "../calendarRules";
import { Anchor } from "./anchors";
import { ErrLine, OkLine, P, Panel, PanelHead, defer } from "./parts";

type Contract = {
  id: string | null; job_id: string; status: "draft" | "sent" | "signed" | "void" | null;
  source: "generated" | "uploaded"; body_md: string | null; custom_clauses: string | null;
  uploaded_path: string | null; uploaded_ack: boolean;
  contractor_signed_at: string | null; client_signed_at: string | null; signed_at: string | null;
};

const fmt = (ts: string | null | undefined) =>
  ts ? new Date(ts).toLocaleString("en-CA", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }) : "";

/** web renderMd: headings, bold, bullet lists, paragraphs. Text only, nothing executed. */
function Md({ md }: { md: string }) {
  const { t } = useTheme();
  const inline = (s: string, key: number) => (
    <Txt key={key} size={0.84} lh={1.6} color={t.ink2}>
      {s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**")
        ? <Txt key={i} size={0.84} variant="bodyBold" color={t.ink2}>{p.slice(2, -2)}</Txt> : p))}
    </Txt>
  );
  const out: React.ReactNode[] = [];
  (md || "").replace(/\r/g, "").split("\n").forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^#\s+/.test(line)) out.push(<Txt key={i} variant="label" size={1.1} style={{ marginTop: t.s2 }}>{line.replace(/^#\s+/, "")}</Txt>);
    else if (/^##\s+/.test(line)) out.push(<Txt key={i} variant="label" size={0.85} color={t.accent500} style={{ marginTop: t.s3 }}>{line.replace(/^##\s+/, "")}</Txt>);
    else if (/^[-*]\s+/.test(line)) out.push(<View key={i} style={{ flexDirection: "row", gap: t.s2, paddingLeft: t.s2 }}><Txt size={0.84} color={t.ink2}>•</Txt><View style={{ flex: 1 }}>{inline(line.replace(/^[-*]\s+/, ""), 0)}</View></View>);
    else if (line !== "") out.push(inline(line, i));
  });
  return <View style={{ gap: t.s1 }}>{out}</View>;
}

export function ContractPanel({ job, onUpdated, primary }: { job: any; onUpdated: () => Promise<unknown> | void; primary: boolean }) {
  return (
    <Anchor id={CONTRACT_ANCHOR}>
      <ContractBody job={job} onUpdated={onUpdated} primary={primary} />
    </Anchor>
  );
}

function ContractBody({ job, onUpdated, primary }: { job: any; onUpdated: () => Promise<unknown> | void; primary: boolean }) {
  const { t } = useTheme();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState("");
  const [clauses, setClauses] = useState("");
  const [source, setSource] = useState<"generated" | "uploaded">("generated");
  const [uploadAck, setUploadAck] = useState(false);
  const [sigName, setSigName] = useState("");
  const [consent, setConsent] = useState(false);
  const [notReady, setNotReady] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const { data, error } = await supabase.rpc("get_job_contract", { p_job_id: job.id });
    if (error) { setLoadFailed(true); setLoading(false); return; }
    const row = data && typeof data === "object" && (data as { id?: string | null }).id ? (data as unknown as Contract) : null;
    setLoadFailed(false);
    setContract(row);
    if (row) { setClauses(row.custom_clauses || ""); setSource(row.source || "generated"); setUploadAck(!!row.uploaded_ack); }
    setLoading(false);
  }, [job.id]);
  useEffect(() => { defer(load); }, [load]);

  const status = contract?.status ?? null;
  const composing = !loading && !loadFailed && status !== "signed" && status !== "sent";

  // The generated body, for the pro to read before signing (web: same effect).
  useEffect(() => {
    if (!composing) return;
    let alive = true;
    void supabase.rpc("build_contract_body", { p_job_id: job.id }).then(({ data }) => { if (alive && typeof data === "string") setPreview(data); });
    return () => { alive = false; };
  }, [composing, job.id]);

  // Why the agreement can't be sent yet (contract_ready: NULL = ready, else the reason).
  useEffect(() => {
    if (!composing) return;
    let alive = true;
    void supabase.rpc("contract_ready", { p_job_id: job.id }).then(({ data, error }) => {
      if (alive) setNotReady(error ? null : (typeof data === "string" && data ? data : null));
    });
    return () => { alive = false; };
  }, [composing, job.id, job.amount, job.scheduled_at, job.client_approved_at]);

  const sign = async () => {
    if (sigName.trim().length < 2) { setErr("Type your full legal name to sign."); return; }
    if (!consent) { setErr("Please confirm you agree to sign electronically."); return; }
    if (source === "uploaded" && !contract?.uploaded_path) { setErr("Choose the document you want to send, or switch to the standard agreement."); return; }
    if (source === "uploaded" && !uploadAck) { setErr("Please confirm your uploaded document doesn't shift liability onto Freddy Fix It."); return; }
    if (!(await ensureTermsAccepted("sign-contract"))) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const { error: sErr } = await supabase.rpc("save_contract_draft", {
        p_job_id: job.id,
        p_custom_clauses: clauses.trim() || null,
        p_source: source,
        p_uploaded_path: contract?.uploaded_path ?? null,
        p_uploaded_ack: source === "uploaded" ? uploadAck : false,
      });
      if (sErr) throw new Error(sErr.message);
      const { data, error } = await supabase.functions.invoke("contract-sign", { body: { action: "contractor_sign", job_id: job.id, signer_name: sigName.trim() } });
      if (error) {
        let m = "Could not sign right now. Please try again.";
        try { const j = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.(); if (j?.error) m = j.error; } catch { /* body was not JSON: keep the default */ }
        throw new Error(m);
      }
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
      setMsg("Signed and sent to your client. They'll be asked to review and sign before any payment is collected.");
      setConsent(false);
      await load();
      await onUpdated();
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <Panel>
        <View accessibilityLabel="Loading the agreement" style={{ gap: t.s3 }}>
          <Sk w="42%" h={t.s4} /><SkText lines={3} />
        </View>
      </Panel>
    );
  }
  if (loadFailed) {
    return (
      <Panel tone="danger">
        <PanelHead icon="alert-triangle" color={t.danger}>SERVICE AGREEMENT</PanelHead>
        <P>{"We couldn't load this job's agreement just now, so we can't show you where it stands. Nothing has been lost \u2014 please try again."}</P>
        <Button onPress={() => { setLoading(true); void load(); }}>Try again</Button>
      </Panel>
    );
  }
  if (status === "signed") {
    return (
      <Panel tone="good">
        <PanelHead icon="check-circle" color={t.success}>SERVICE AGREEMENT — SIGNED</PanelHead>
        <P>{"Signed by both parties" + (contract?.signed_at ? " on " + fmt(contract.signed_at) : "") + ". This agreement is now in effect."}</P>
        <Card><Row icon="file" tone="neutral" title="View / print the signed copy" sub="Opens on freddyfixit.ca" chevron onPress={() => openOnWeb("/contractor-dashboard")} /></Card>
      </Panel>
    );
  }
  if (status === "sent") {
    return (
      <Panel tone="info">
        <PanelHead icon="clock" color={t.info}>AGREEMENT SENT — WAITING FOR YOUR CLIENT</PanelHead>
        <P>{"You signed on " + fmt(contract?.contractor_signed_at) + ". Your client has been emailed to review and sign. Payment can't be collected until they do."}</P>
      </Panel>
    );
  }

  const body = contract?.body_md || preview;
  const canUseUploaded = !!contract?.uploaded_path;
  return (
    <Panel>
      <PanelHead icon="clipboard-list">SERVICE AGREEMENT — REQUIRED BEFORE PAYMENT</PanelHead>
      <P>This job needs a signed agreement before any money is collected. Review the agreement below, add anything you like, then sign to send it to your client for their signature.</P>
      {/* Date & time and price first: they are what the agreement is ABOUT (web). */}
      <View style={{ flexDirection: "row", gap: t.s2 }}>
        {([["calendar", "DATE & TIME", job?.scheduled_at ? new Date(job.scheduled_at).toLocaleString("en-CA", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null],
          ["dollar", "PRICE", job?.amount != null ? "$" + job.amount : null]] as const).map(([icon, label, value]) => (
          <View key={label} style={{ flex: 1, minWidth: 0, padding: t.s3, borderRadius: t.r2, backgroundColor: value ? rgba(t.fg, 0.04) : rgba(t.warnRgb, 0.08), borderWidth: t.hairW, borderColor: value ? rgba(t.fg, 0.1) : rgba(t.warnRgb, 0.3) }}>
            <View style={{ flexDirection: "row", gap: t.s1, alignItems: "center" }}><Ic name={icon} size={t.s3} color={rgba(t.muted, 0.6)} /><Txt variant="label" size={0.7} color={rgba(t.muted, 0.6)}>{label}</Txt></View>
            <Txt size={0.85} variant="bodyMedium" color={value ? t.text : t.warn} style={{ marginTop: t.s1 }}>{value ?? "Set this below first"}</Txt>
          </View>
        ))}
      </View>

      <Txt size={0.85} variant="bodyMedium">Which agreement?</Txt>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: t.s2 }}>
        {(["generated", "uploaded"] as const).map((sv) => {
          const on = source === sv;
          return (
            <View key={sv} style={{ flex: 1 }}>
              <Button variant={on ? "secondary" : "ghost"} onPress={() => {
                if (sv === "uploaded" && !canUseUploaded) { openOnWeb("/contractor-dashboard"); return; }
                setSource(sv); setErr(null);
              }}>{(on ? "✓ " : "") + (sv === "generated" ? "Standard agreement" : "Upload my own")}</Button>
            </View>
          );
        })}
      </View>
      {!canUseUploaded ? <Txt size={0.76} color={rgba(t.muted, 0.6)}>Sending your own document opens freddyfixit.ca, where you can attach a PDF or Word file.</Txt> : null}

      {source === "generated" ? (
        <View style={{ padding: t.s3, borderRadius: t.r2, backgroundColor: rgba(t.fg, 0.03), borderWidth: t.hairW, borderColor: rgba(t.fg, 0.1) }}>
          {body ? <Md md={body} /> : <Txt size={0.82} color={rgba(t.muted, 0.6)}>Preparing your agreement…</Txt>}
        </View>
      ) : (
        <View style={{ gap: t.s2 }}>
          <Txt size={0.82} color={t.success}>✓ Document attached</Txt>
          <Tick checked={uploadAck} onChange={setUploadAck} label="Confirm the document places no liability on Freddy Fix It">
            <Txt size={0.8} lh={1.5} color={rgba(t.muted, 0.9)}>{"I confirm this document is between me and my client only. It does not place any liability, obligation, or warranty on Freddy Fix It, and Freddy Fix It's standard terms and Alberta cancellation rights still apply."}</Txt>
          </Tick>
        </View>
      )}

      <Field label="Additional terms (optional)" multiline value={clauses} onChangeText={setClauses} placeholder="e.g. warranty details, materials not included, access notes…" />

      <View style={{ borderTopWidth: t.hairW, borderTopColor: rgba(t.fg, 0.1), paddingTop: t.s3, gap: t.s3 }}>
        <Field label="Sign as the contractor" value={sigName} onChangeText={setSigName} placeholder="Type your full legal name" autoComplete="name" textContentType="name" />
        <Tick checked={consent} onChange={setConsent} label="I agree to sign electronically">
          <Txt size={0.8} lh={1.5} color={rgba(t.muted, 0.9)}>I agree that typing my name is my legal electronic signature, and I consent to signing this agreement electronically.</Txt>
        </Tick>
        {notReady ? (
          <Panel tone="warn"><View style={{ flexDirection: "row", gap: t.s2 }}><Ic name="alert-triangle" size={t.s3} color={t.warn} /><Txt size={0.82} lh={1.55} color={t.warn} style={{ flex: 1 }}>{notReady}</Txt></View></Panel>
        ) : null}
        <ErrLine>{err}</ErrLine>
        <OkLine>{msg}</OkLine>
        <Button full variant={primary ? "primary" : "secondary"} loading={busy} disabled={busy || !!notReady} onPress={() => void sign()}>Sign & send agreement to client</Button>
      </View>
    </Panel>
  );
}
