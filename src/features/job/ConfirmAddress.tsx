// Port of web components/ConfirmAddress.tsx: the last step before a client pays
// their deposit. The request only ever carried a postal code and an area token;
// the street address is collected here, on the JOB, once a pro is chosen, so only
// that pro can read it (jobs RLS). The write is confirm_job_address(), whose
// refusals are plain English and shown verbatim (each is something to act on).
//
// The deposit button's gate is jobRules.addressMissing(job): ONE predicate shared
// by this panel, the attention row and the button, so they can never disagree.
// Every branch carries ADDRESS_ANCHOR (the confirmed one too: "Change the address"
// still has to land somewhere).
//
// Not ported: "Use my current location" (needs expo-location, a native module and
// a new dev build). Typing and the saved-address picks are web's primary path.
import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Card, Field, Ic, Txt, rgba, ui, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { Chip, Chips, LinkButton } from "@/features/request/pieces";
import { ADDRESS_ANCHOR, Anchor } from "./anchors";

/** The client's saved addresses, newest first; null when the read failed. */
async function readSaved(userId: string): Promise<{ id: string; address: string }[] | null> {
  try {
    const { data, error } = await supabase.from("saved_addresses").select("id, address")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(6);
    if (error) return null;
    return ((data ?? []) as { id: string; address: string | null }[])
      .filter((r) => String(r.address || "").trim()).map((r) => ({ id: r.id, address: String(r.address) }));
  } catch { return null; }
}

export function ConfirmAddress({ job, userId, onConfirmed, primary }: { job: any; userId: string; onConfirmed: (address: string) => void; primary?: boolean }) {
  const { t } = useTheme();
  const current = String(job?.service_address || "").trim();
  const [editing, setEditing] = useState(false);
  const [addr, setAddr] = useState("");
  // null = the read failed: no picks, and nothing is remembered (no duplicate risk).
  const [saved, setSaved] = useState<{ id: string; address: string }[] | null>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Quick-pick list. A failed read leaves the typing path untouched: a missing shortcut isn't worth an error.
  const loadSaved = useCallback(async () => { setSaved(await readSaved(userId)); }, [userId]);
  useEffect(() => {
    let alive = true;
    void readSaved(userId).then((r) => { if (alive) setSaved(r); });
    return () => { alive = false; };
  }, [userId]);

  // Remember it for next time, AFTER the confirmation succeeded. Convenience only: never fails the step.
  const remember = async (value: string) => {
    try {
      if (!saved) return; // only de-duplicate against a list we actually read
      if (saved.some((r) => r.address.trim().toLowerCase() === value.trim().toLowerCase())) return;
      await supabase.from("saved_addresses").insert({ user_id: userId, address: value, label: null });
      void loadSaved();
    } catch { /* convenience only */ }
  };

  const save = async (value: string) => {
    const v = value.trim();
    if (!v) { setErr("Please enter the full street address, including the house or unit number."); return; }
    setBusy(true); setErr(null);
    try {
      const { data, error } = await supabase.rpc("confirm_job_address", { p_job_id: job.id, p_address: v });
      if (error) { setErr(error.message || "We couldn't save that address. Please try again."); return; }
      const stored = String(data || v);
      setEditing(false);
      setAddr("");
      onConfirmed(stored);
      void remember(stored);
    } catch {
      setErr("We couldn't save that address. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // ---- Confirmed ----
  if (current && !editing) {
    return (
      <Anchor id={ADDRESS_ANCHOR}>
        <Card style={{ padding: t.s4, borderColor: rgba(t.successRgb, 0.25), backgroundColor: rgba(t.successRgb, 0.07) }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.s2, marginBottom: t.s2 }}>
            <Ic name="map-pin" size={ui.icon.sm} color={rgba(t.muted, 0.7)} />
            <Txt variant="label" size={0.78} color={rgba(t.muted, 0.7)}>SERVICE ADDRESS</Txt>
          </View>
          <Txt size={0.95} lh={1.5}>{current}</Txt>
          <Txt size={0.8} color={rgba(t.muted, 0.6)} style={{ marginTop: t.s2 }}>Only your pro can see this.</Txt>
          <LinkButton onPress={() => { setAddr(current); setEditing(true); setErr(null); }}>Change the address</LinkButton>
        </Card>
      </Anchor>
    );
  }

  // ---- Needs confirming (or being changed) ----
  return (
    <Anchor id={ADDRESS_ANCHOR}>
      <Card style={{ padding: t.s4, borderColor: t.accentLine, backgroundColor: rgba(t.accentRgb, 0.08) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.s2, marginBottom: t.s2 }}>
          <Ic name="map-pin" size={ui.icon.sm} color={t.accent500} />
          <Txt variant="label" size={0.78} color={t.accent500}>{current ? "CHANGE THE SERVICE ADDRESS" : "CONFIRM YOUR ADDRESS"}</Txt>
        </View>
        <Txt size={0.86} lh={1.6} color={t.ink2}>
          {current
            ? "Update where your pro should go. They'll see the change straight away."
            : "We only shared your postal code while you were comparing estimates. Now that you've picked your pro, they need the full address to show up — this is the last step before payment."}
        </Txt>
        {saved && saved.length > 0 ? (
          <View style={{ marginTop: t.s3 }}>
            <Txt size={0.78} color={rgba(t.muted, 0.6)} style={{ marginBottom: t.s2 }}>Use a saved address</Txt>
            <Chips>
              {saved.map((r) => <Chip key={r.id} label={r.address} onPress={() => { if (!busy) void save(r.address); }} a11y={"Use " + r.address} />)}
            </Chips>
          </View>
        ) : null}
        <Field label="Full street address" value={addr} onChangeText={setAddr} placeholder="123 Example Street NW, Calgary, AB"
          autoComplete="street-address" textContentType="fullStreetAddress" error={err} />
        <View style={{ marginTop: t.s4, gap: t.s2 }}>
          <Button full variant={primary ? "primary" : "secondary"} loading={busy} onPress={() => void save(addr)}>
            {busy ? "Saving…" : current ? "Save the new address" : "Confirm this address"}
          </Button>
          {current ? <LinkButton onPress={() => { setEditing(false); setErr(null); setAddr(""); }}>Cancel</LinkButton> : null}
        </View>
        <Txt size={0.78} color={rgba(t.muted, 0.55)} style={{ marginTop: t.s3 }}>Shared only with the pro you hired, never with the others who quoted.</Txt>
      </Card>
    </Anchor>
  );
}
