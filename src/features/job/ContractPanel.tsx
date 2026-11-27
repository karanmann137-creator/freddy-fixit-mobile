// Port of web components/ContractPanel.tsx, CLIENT role (PLAN 4.7, §6.3).
//
// ⚠️ THE HIGHEST-RISK SURFACE ON THE PLATFORM. Every job needs an e-signed
// Service Agreement, and the charge functions answer HTTP 428 until
// contract_signed() is true. So if this panel isn't mounted on the job screen the
// client has nowhere to sign, and the job can never be paid for, with no error
// anywhere. check-rules.mjs carries the mount.
//
// Rules kept from web:
//   · EVERY branch, loading included, carries the contract anchor (<Shell> below
//     wraps each one in <Anchor id={CONTRACT_ANCHOR}>). A "Review & sign" tap
//     usually lands before get_job_contract resolves.
//   · A failed read is NOT "no agreement yet": it says it couldn't load and offers
//     a retry, never "your contractor is preparing it".
//   · The signature goes through the same edge function (contract-sign,
//     action client_sign) with the same checks: a typed legal name, the e-sign
//     consent, then the terms gate. A refusal shows the function's own reason.
// The contractor's compose-and-send branch is not here: it arrives with the
// contractor job screen (5.6/5.7) and must reuse this file, not copy it.
import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Button, Card, Field, Ic, Sk, SkText, Txt, rgba, ui, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { ensureTermsAccepted } from "@/lib/terms";
import { Tick } from "@/features/request/pieces";
import { openOnWeb, webJobPath } from "@/features/client/web";
import { Anchor, CONTRACT_ANCHOR } from "./anchors";
import { invokeReason } from "./reads";

type Contract = {
  id: string | null;
  status: "draft" | "sent" | "signed" | "void" | null;
  source: "generated" | "uploaded" | null;
  body_md: string | null;
  custom_clauses: string | null;
  uploaded_path: string | null;
  contractor_signed_at: string | null;
  client_signed_at: string | null;
  signed_at: string | null;
};

async function readContract(jobId: string): Promise<{ ok: true; row: Contract | null } | { ok: false }> {
  try {
    const { data, error } = await supabase.rpc("get_job_contract", { p_job_id: jobId });
    if (error) return { ok: false };
    return { ok: true, row: data && (data as { id?: string | null }).id ? (data as unknown as Contract) : null };
  } catch {
    return { ok: false };
  }
}

const fmt = (ts: string | null | undefined) => {
  if (!ts) return "";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-CA", { timeZone: "America/Edmonton", dateStyle: "medium", timeStyle: "short" });
};

/** Every branch's frame. The anchor is here so no branch can be written without it. */
function Shell({ tone = "neutral", children }: { tone?: "neutral" | "good" | "accent" | "danger"; children: React.ReactNode }) {
  const { t } = useTheme();
  const border = { neutral: t.cardBorder, good: rgba(t.successRgb, 0.35), accent: t.accentLine, danger: rgba(t.dangerRgb, 0.35) }[tone];
  return (
    <Anchor id={CONTRACT_ANCHOR}>
      <Card style={{ borderColor: border, padding: t.s4 }}>{children}</Card>
    </Anchor>
  );
}

function Label({ icon, color, children }: { icon: "file" | "check-circle" | "alert-triangle" | "clipboard-list"; color: string; children: string }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: t.s2, marginBottom: t.s3 }}>
      <Ic name={icon} size={ui.icon.sm} color={color} />
      <Txt variant="label" size={0.78} color={rgba(t.muted, 0.7)} ls={0.1} accessibilityRole="header">{children.toUpperCase()}</Txt>
    </View>
  );
}

/** Web renderMd: headings, bold, bullets, paragraphs. The text is the legal document, reproduced verbatim. */
function Md({ md }: { md: string }) {
  const { t } = useTheme();
  const inline = (s: string, key: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4
      ? <Txt key={key + i} variant="bodyBold" size={0.86}>{p.slice(2, -2)}</Txt>
      : p);
  return (
    <View style={{ gap: t.s1 }}>
      {(md || "").replace(/\r/g, "").split("\n").map((raw, i) => {
        const line = raw.trimEnd();
        if (line === "") return <View key={i} style={{ height: t.s1 }} />;
        if (/^#\s+/.test(line)) return <Txt key={i} variant="label" size={1.1} style={{ marginTop: t.s2 }}>{line.replace(/^#\s+/, "")}</Txt>;
        if (/^##\s+/.test(line)) return <Txt key={i} variant="bodyBold" size={0.8} color={t.accent500} style={{ marginTop: t.s3 }}>{line.replace(/^##\s+/, "").toUpperCase()}</Txt>;
        if (/^[-*]\s+/.test(line)) return <Txt key={i} size={0.86} lh={1.55} color={t.ink2}>{"•  "}{inline(line.replace(/^[-*]\s+/, ""), "b" + i)}</Txt>;
        return <Txt key={i} size={0.86} lh={1.6} color={t.ink2}>{inline(line, "p" + i)}</Txt>;
      })}
    </View>
  );
}

export function ContractPanel({ job, onUpdated, primary }: { job: any; onUpdated?: () => void; primary?: boolean }) {
  const { t } = useTheme();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sigName, setSigName] = useState("");
  const [consent, setConsent] = useState(false);
  const jobId: string = job.id;

  // A failed read keeps whatever we last had: it never turns into "no agreement yet".
  const apply = useCallback((r: Awaited<ReturnType<typeof readContract>>) => {
    if (r.ok) { setContract(r.row); setLoadFailed(false); setErr(null); } else setLoadFailed(true);
    setLoading(false);
  }, []);
  const load = useCallback(async () => { apply(await readContract(jobId)); }, [apply, jobId]);

  useEffect(() => {
    let alive = true;
    void readContract(jobId).then((r) => { if (alive) apply(r); });
    return () => { alive = false; };
  }, [apply, jobId]);

  const viewUpload = async () => {
    if (!contract?.uploaded_path) return;
    const { data, error } = await supabase.storage.from("contracts").createSignedUrl(contract.uploaded_path, 3600);
    if (error || !data?.signedUrl) { setErr("Could not open the document."); return; }
    WebBrowser.openBrowserAsync(data.signedUrl).catch(() => setErr("Could not open the document."));
  };

  const clientSign = async () => {
    if (sigName.trim().length < 2) { setErr("Type your full legal name to sign."); return; }
    if (!consent) { setErr("Please confirm you agree to sign electronically."); return; }
    // Terms gate after this form's own checks, before busy. Fails open (terms.ts); false = they declined.
    if (!(await ensureTermsAccepted("sign-contract"))) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("contract-sign", {
        body: { action: "client_sign", job_id: jobId, signer_name: sigName.trim() },
      });
      const reason = await invokeReason(error, data, "Could not sign right now. Please try again.");
      if (reason) throw new Error(reason);
      setMsg("Signed. A copy of the fully-signed agreement has been emailed to you.");
      setConsent(false);
      await load();
      onUpdated?.();
    } catch (e) {
      setErr((e as Error)?.message || "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  };

  // ---------- LOADING (anchored: the tap usually lands here) ----------
  if (loading) {
    return (
      <Shell>
        <View accessibilityLabel="Loading the agreement" style={{ gap: t.s3 }}>
          <Sk w="42%" h={ui.skLine} />
          <SkText lines={3} />
        </View>
      </Shell>
    );
  }

  // ---------- FAILED READ: never "no agreement yet" ----------
  if (loadFailed && !contract) {
    return (
      <Shell tone="danger">
        <Label icon="alert-triangle" color={t.danger}>Service agreement</Label>
        <Txt size={0.88} lh={1.55} color={rgba(t.muted, 0.9)}>
          We couldn’t load this job’s agreement just now, so we can’t show you where it stands. Nothing has been lost — please try again.
        </Txt>
        <View style={{ marginTop: t.s3 }}>
          <Button onPress={() => { setLoading(true); void load(); }}>Try again</Button>
        </View>
      </Shell>
    );
  }

  const status = contract?.status ?? null;

  // ---------- SIGNED ----------
  if (status === "signed") {
    return (
      <Shell tone="good">
        <Label icon="check-circle" color={t.success}>Service agreement — signed</Label>
        <Txt size={0.88} lh={1.55} color={rgba(t.muted, 0.9)}>
          Signed by both parties{contract?.signed_at ? " on " + fmt(contract.signed_at) : ""}. This agreement is now in effect.
        </Txt>
        <View style={{ marginTop: t.s3, gap: t.s2 }}>
          {/* The printable signed copy is web's print shell (printDoc), which has no app
              counterpart yet. It was also emailed to the client at signing. */}
          <Button onPress={() => void openOnWeb(webJobPath(jobId))}>View the signed copy on the website</Button>
          {contract?.source === "uploaded" && contract?.uploaded_path ? <Button variant="ghost" onPress={() => void viewUpload()}>View attached document</Button> : null}
        </View>
        {err ? <Txt size={0.82} color={t.danger} style={{ marginTop: t.s2 }}>{err}</Txt> : null}
      </Shell>
    );
  }

  // ---------- NOT SENT YET (none / draft / void) ----------
  if (status !== "sent") {
    return (
      <Shell>
        <Label icon="clipboard-list" color={t.accent500}>Service agreement</Label>
        <Txt size={0.88} lh={1.55} color={rgba(t.muted, 0.9)}>
          Your contractor is preparing the agreement for this job. You’ll be asked to review and sign it here before any payment is collected — we’ll email you when it’s ready.
        </Txt>
      </Shell>
    );
  }

  // ---------- SENT: review & sign ----------
  return (
    <Shell tone="accent">
      <Label icon="clipboard-list" color={t.accent500}>Review & sign your agreement</Label>
      <Txt size={0.86} lh={1.55} color={rgba(t.muted, 0.85)}>
        Your contractor signed on {fmt(contract?.contractor_signed_at)}. Please read the agreement, then add your signature. This is required before any payment.
      </Txt>
      {contract?.source === "uploaded" ? (
        <View style={{ marginTop: t.s3 }}>
          <Button variant="ghost" onPress={() => void viewUpload()}>View the contractor’s document</Button>
          <Txt size={0.78} color={rgba(t.muted, 0.7)} style={{ marginTop: t.s2 }}>Freddy Fix It’s standard terms and your Alberta cancellation rights (below) also apply.</Txt>
        </View>
      ) : null}
      <View style={{ marginTop: t.s3, padding: t.s3, borderRadius: t.r2, backgroundColor: rgba(t.fg, 0.03), borderWidth: t.hairW, borderColor: rgba(t.fg, 0.1) }}>
        {contract?.body_md ? <Md md={contract.body_md} /> : <Txt size={0.84} color={rgba(t.muted, 0.6)}>Agreement unavailable — pull down to refresh.</Txt>}
        {contract?.custom_clauses ? (
          <View style={{ marginTop: t.s3 }}>
            <Txt variant="bodyBold" size={0.8} color={t.accent500}>ADDITIONAL TERMS (FROM THE CONTRACTOR)</Txt>
            <Md md={contract.custom_clauses} />
          </View>
        ) : null}
      </View>
      <Field label="Your full legal name" value={sigName} onChangeText={setSigName} placeholder="Type your full legal name" autoComplete="name" textContentType="name" autoCapitalize="words" />
      <Tick checked={consent} onChange={setConsent} label="I agree that typing my name is my legal electronic signature, and I consent to signing this agreement electronically.">
        <Txt size={0.82} lh={1.5} color={rgba(t.muted, 0.9)}>I agree that typing my name is my legal electronic signature, and I consent to signing this agreement electronically.</Txt>
      </Tick>
      {err ? <Txt size={0.84} color={t.danger} style={{ marginTop: t.s3 }} accessibilityLiveRegion="polite">{err}</Txt> : null}
      {msg ? <Txt size={0.84} color={t.success} style={{ marginTop: t.s3 }} accessibilityLiveRegion="polite">{msg}</Txt> : null}
      <View style={{ marginTop: t.s4 }}>
        <Button full variant={primary ? "primary" : "secondary"} loading={busy} onPress={() => void clientSign()}>{busy ? "Signing…" : "Sign & accept agreement"}</Button>
      </View>
    </Shell>
  );
}
