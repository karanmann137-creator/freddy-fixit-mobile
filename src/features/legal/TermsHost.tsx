// Port of web components/TermsSheet.tsx: the sheet ensureTermsAccepted() asks with.
// Mounted ONCE in the root layout (check-rules enforces it). Without it,
// ensureTermsAccepted() fails OPEN by design (terms.ts), so a bid or a request
// would go through without the person ever seeing changed terms: silent, and a
// legal record gap. Same words as web.
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { BottomSheet, Button, ButtonRow, Txt, rgba, useTheme } from "@/kit";
import { on } from "@/lib/bus";
import { acceptTerms, termsSheetMounted, TERMS_GATE_EVENT } from "@/lib/terms";
import { openOnWeb } from "@/features/client/web";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function prettyVersion(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return v;
  const mon = MONTHS[Number(m[2]) - 1];
  if (!mon) return v;
  return mon + " " + String(Number(m[3])) + ", " + m[1];
}

type Pending = { surface: string; version: string | null; resolve: (ok: boolean) => void };

export function TermsHost() {
  const { t } = useTheme();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    termsSheetMounted(true);
    const off = on(TERMS_GATE_EVENT, (detail: unknown) => {
      const d = detail as Pending | undefined;
      if (!d || typeof d.resolve !== "function") return;
      // One at a time, as web: a second ask while one is open is declined.
      setPending((prev) => { if (prev) { d.resolve(false); return prev; } return d; });
    });
    return () => { off(); termsSheetMounted(false); };
  }, []);

  const settle = (ok: boolean) => {
    const r = pending?.resolve;
    setPending(null); setBusy(false); setFailed(false);
    r?.(ok);
  };
  const onAccept = async () => {
    if (!pending) return;
    setBusy(true); setFailed(false);
    const ok = await acceptTerms(pending.surface);
    if (!ok) { setBusy(false); setFailed(true); return; }
    settle(true);
  };

  const published = prettyVersion(pending?.version ?? null);
  const muted = rgba(t.muted, 0.9);
  // No scrim or back-button dismiss (web: "NO SCRIM DISMISS AND NO ESCAPE DISMISS"):
  // a stray tap would silently drop the bid being placed. "Not now" is the only
  // way out (review G5 #1).
  const keepOpen = () => undefined;
  return (
    <BottomSheet open={!!pending} onClose={keepOpen} label="We've updated our terms">
      <View style={{ gap: t.s3 }}>
        <Txt variant="label" size={1.5} ls={0.04} accessibilityRole="header">{"We've updated our terms"}</Txt>
        <Txt size={0.92} lh={1.6} color={muted}>
          {published
            ? "Our User Agreement and Privacy Policy changed on " + published + ". The main change: we now list every outside service we use to run Freddy Fix It and what each one sees."
            : "Our User Agreement and Privacy Policy have changed. The main change: we now list every outside service we use to run Freddy Fix It and what each one sees."}
        </Txt>
        <Txt size={0.92} lh={1.6} color={muted}>Please accept to continue.</Txt>
        <ButtonRow>
          <Button variant="ghost" onPress={() => openOnWeb("/user-agreement")}>User Agreement</Button>
          <Button variant="ghost" onPress={() => openOnWeb("/privacy-policy")}>Privacy Policy</Button>
        </ButtonRow>
        {failed ? <Txt size={0.85} lh={1.5} color={t.danger} accessibilityRole="alert">{"We couldn't record that just now. Check your connection and try again."}</Txt> : null}
        <ButtonRow>
          <Button onPress={() => settle(false)} disabled={busy}>Not now</Button>
          <Button variant="primary" onPress={() => void onAccept()} loading={busy}>{failed ? "Try again" : "Accept and continue"}</Button>
        </ButtonRow>
      </View>
    </BottomSheet>
  );
}
