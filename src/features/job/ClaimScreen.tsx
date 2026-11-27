// File a claim (port of web components/ReportProblem.tsx, opened from the job's
// "Something wrong? File a claim"). An official claim under the Homeowner
// Protection Promise: open_dispute() freezes the job's held money while the team
// reviews it. Same fields, same words, same RPC as web; its refusal is shown as it
// comes back, and nothing typed is lost on a failure.
//
// Photos: compressed (`photo` profile), uploaded to problem-photos under
// <uid>/<job>-…, and scanned as EVIDENCE (a claim may show an injury, so only
// sexual/hate content blocks), exactly as web. A refused photo says so and the
// form stays.
//
// MONEY: calls open_dispute only. Touches none of the four payout guards (a
// disputed job is excluded from payout server-side).
import React, { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Button, Card, Field, FormNote, Ic, Screen, ScreenHeader, Txt, notify, rgba, ui, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { readAuthUser } from "@/lib/authRead";
import type { UploadAsset } from "@/lib/imageCompress";
import { uploadImage } from "@/platform/upload";
import { ChoiceRow, Label, LinkButton, Tick, isIsoDate } from "@/features/request/pieces";
import { PHOTO_MAX_BYTES, PHOTO_TOO_BIG } from "@/features/request/webPage";

const REASONS = ["Work was not completed", "Work was poor quality", "Damage was caused", "Contractor never showed up", "Charged more than agreed", "Something else"];
const REMEDIES = ["Have the work redone or fixed", "A partial refund", "A full refund", "Not sure / other"];
const MAX_PHOTOS = 5;

export function ClaimScreen() {
  const { t } = useTheme();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const jobId = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const [reason, setReason] = useState(REASONS[0]);
  const [serviceDate, setServiceDate] = useState("");
  const [agreedScope, setAgreedScope] = useState("");
  const [description, setDescription] = useState("");
  const [remedy, setRemedy] = useState(REMEDIES[0]);
  const [amount, setAmount] = useState("");
  const [photos, setPhotos] = useState<UploadAsset[]>([]);
  const [declarant, setDeclarant] = useState("");
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/client"));

  const addPhotos = async () => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS - photos.length });
      if (r.canceled || !r.assets?.length) return; // a cancelled picker returns nothing: keep what's there
      const ok = r.assets.filter((a) => !(typeof a.fileSize === "number" && a.fileSize > PHOTO_MAX_BYTES));
      if (ok.length < r.assets.length) setErr(PHOTO_TOO_BIG);
      setPhotos((p) => [...p, ...ok.map((a) => ({ uri: a.uri, mimeType: a.mimeType ?? null, fileName: a.fileName ?? null, width: a.width, height: a.height }))].slice(0, MAX_PHOTOS));
    } catch {
      setErr("Couldn't open your photos. Try again.");
    }
  };

  const submit = async () => {
    if (!description.trim()) { setErr("Please describe what went wrong."); return; }
    if (!declared) { setErr("Please confirm the declaration before submitting."); return; }
    if (!declarant.trim()) { setErr("Please type your full name to sign the declaration."); return; }
    const date = serviceDate.trim();
    if (date && !isIsoDate(date)) { setErr("Type the date of service as YYYY-MM-DD, or leave it empty."); return; }
    const amt = amount.trim() ? Number(amount.trim().replace(/[$,\s]/g, "")) : null;
    if (amt != null && (!Number.isFinite(amt) || amt < 0)) { setErr("Type the amount as a number, or leave it empty."); return; }
    setBusy(true); setErr(null);
    try {
      const who = await readAuthUser();
      if (who.kind !== "user") { setErr(who.kind === "unknown" ? "We couldn't check you're signed in. Check your connection and try again." : "Please sign in again to file a claim."); return; }
      const paths: string[] = [];
      for (const a of photos) {
        const key = `${who.userId}/${jobId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const up = await uploadImage({ bucket: "problem-photos", basePath: key, asset: a, profile: "photo", evidence: true });
        if (!up.ok) {
          setErr(up.blocked ? up.message + " Please remove it and submit your claim again — the rest of what you've written is still here." : up.message);
          return;
        }
        paths.push(up.path);
      }
      const { error } = await supabase.rpc("open_dispute", {
        p_job_id: jobId,
        p_reason: reason,
        p_description: description.trim(),
        p_service_date: date || null,
        p_agreed_scope: agreedScope.trim() || null,
        p_requested_remedy: remedy,
        p_amount_in_dispute: amt,
        p_declarant_name: declarant.trim(),
        p_photo_paths: paths,
      });
      if (error) { setErr(error.message); return; }
      notify("Claim submitted — we'll review it.");
      back(); // the job screen re-reads on focus and shows "Claim filed — under review"
    } catch (e) {
      setErr((e as Error)?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="File a claim" onBack={back} />
      <Txt size={0.86} lh={1.5} color={rgba(t.muted, 0.75)}>
        This is an official claim under the Homeowner Protection Promise. Your payment stays held and protected while we review it — nothing is released to the contractor in the meantime. The contractor is given a chance to respond before our team decides.
      </Txt>

      <Label>What went wrong?</Label>
      {REASONS.map((r) => <ChoiceRow key={r} title={r} on={reason === r} onPress={() => setReason(r)} />)}

      <Field label="Date of service" value={serviceDate} onChangeText={setServiceDate} placeholder="YYYY-MM-DD (optional)" keyboardType="numbers-and-punctuation" />
      <Field label="What was agreed?" value={agreedScope} onChangeText={setAgreedScope} multiline placeholder="What the contractor agreed to do (scope, price, timeline)…" />
      <Field label="Describe the issue *" value={description} onChangeText={setDescription} multiline placeholder="Tell us exactly what happened, in your own words…" />

      <Label>What outcome do you want?</Label>
      {REMEDIES.map((r) => <ChoiceRow key={r} title={r} on={remedy === r} onPress={() => setRemedy(r)} />)}
      <Field label="Amount ($)" value={amount} onChangeText={setAmount} placeholder="Optional" keyboardType="decimal-pad" />

      <Label aside="optional, up to 5">Add photos</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2 }}>
        {photos.map((p, i) => (
          <View key={p.uri + i}>
            <Image source={{ uri: p.uri }} accessibilityIgnoresInvertColors style={{ width: ui.photoTile, height: ui.photoTile, borderRadius: t.r2 }} />
            <Pressable onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={"Remove photo " + (i + 1)}
              hitSlop={t.s3} style={{ position: "absolute", top: -t.s2, right: -t.s2, minWidth: t.hCtl / 2, minHeight: t.hCtl / 2, alignItems: "center", justifyContent: "center" }}>
              <Ic name="x-circle" size={ui.icon.lg} color={t.text} />
            </Pressable>
          </View>
        ))}
      </View>
      {photos.length < MAX_PHOTOS ? <LinkButton onPress={() => void addPhotos()}>{photos.length ? "Add another photo" : "Choose photos"}</LinkButton> : null}

      <Card style={{ padding: t.s4, marginTop: t.s5, borderColor: t.accentLine, backgroundColor: rgba(t.accentRgb, 0.08) }}>
        <Tick checked={declared} onChange={setDeclared} label="I declare that the information in this claim is true and accurate to the best of my knowledge.">
          <Txt size={0.82} lh={1.5}>I declare that the information in this claim is true and accurate to the best of my knowledge. I understand that filing a false claim may result in my account being removed.</Txt>
        </Tick>
        <Field label="Sign — type your full name *" value={declarant} onChangeText={setDeclarant} placeholder="Your full legal name" autoComplete="name" autoCapitalize="words" />
      </Card>

      {err ? <FormNote>{err}</FormNote> : null}
      <View style={{ marginTop: t.s5, gap: t.s2 }}>
        <Button full variant="primary" loading={busy} onPress={() => void submit()}>{busy ? "Submitting…" : "Submit claim"}</Button>
        <Button full variant="ghost" disabled={busy} onPress={back}>Cancel</Button>
      </View>
    </Screen>
  );
}
