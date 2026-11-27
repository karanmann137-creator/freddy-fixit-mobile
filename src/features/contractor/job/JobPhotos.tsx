// Port of web components/JobPhotos.tsx, contractor side (PLAN 5.7): the mandatory
// before & after photos. `photosMissing` / `beforeRequired` come from the synced
// jobRules.ts, so the attention row, this box, and the Mark complete gate read ONE
// predicate (photo_rules_start semantics unchanged: PHOTO_RULES_START lives there).
//
// Upload order = web: compressImage → storage upload → scan-image (evidence: only
// sexual/hate block) → save_job_photo. uploadImage() does the first three and
// never throws. A photo that is saved but whose signed URL can't be made says so
// with a Try again: it is never shown as "not uploaded" (failed read ≠ empty).
import React, { useEffect, useState } from "react";
import { Image, Pressable, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import { Ic, Txt, rgba, ui, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { beforeRequired, photosMissing } from "@/lib/jobRules";
import type { UploadAsset } from "@/lib/imageCompress";
import { uploadImage } from "@/platform/upload";
import { LinkButton } from "@/features/request/pieces";

const MAX_BYTES = 10 * 1024 * 1024; // web: the completion-photos bucket's 10MB cap
const OK_EXTS = ["jpg", "jpeg", "png", "webp", "heic", "heif"];

/** Camera or library → an asset, or a sentence to show. null = cancelled (web: `if (!f) return`). */
export async function pickPhoto(camera: boolean): Promise<UploadAsset | { error: string } | null> {
  try {
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return { error: "Camera access is off for Freddy Fix It. Turn it on in Settings, or choose a photo you already have." };
    }
    const r = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (r.canceled) return null;
    const a = r.assets?.[0];
    if (!a) return null;
    // HEIC often arrives with no type: fall back to the extension (web rule).
    const ext = (a.fileName || a.uri).split("?")[0].split(".").pop()?.toLowerCase() ?? "";
    const looksLikePhoto = a.mimeType ? a.mimeType.startsWith("image/") : OK_EXTS.includes(ext) || a.type === "image";
    if (!looksLikePhoto) return { error: "That file isn't a photo. Use a JPG, PNG, WEBP or a photo straight from your phone." };
    if (typeof a.fileSize === "number" && a.fileSize > MAX_BYTES) return { error: "That photo is over 10MB. Take it at a lower resolution or pick another one." };
    return { uri: a.uri, mimeType: a.mimeType ?? null, fileName: a.fileName ?? null, width: a.width, height: a.height };
  } catch {
    return { error: "Couldn't open your photos. Try again." };
  }
}

type Kind = "before" | "after";

export function JobPhotos({ job, onSaved, onError }: { job: any; onSaved: () => Promise<unknown> | void; onError: (m: string) => void }) {
  const { t } = useTheme();
  const paths: Record<Kind, string | null> = { before: job?.before_photo_path ?? null, after: job?.completion_photo_path ?? null };
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, true>>({});
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<Kind | null>(null);

  useEffect(() => {
    let alive = true;
    const want = [paths.before, paths.after].filter((p): p is string => !!p && !urls[p]);
    if (!want.length) return;
    void (async () => {
      for (const p of want) {
        const { data, error } = await supabase.storage.from("completion-photos").createSignedUrl(p, 3600);
        if (!alive) return;
        if (error || !data?.signedUrl) setFailed((f) => ({ ...f, [p]: true }));
        else setUrls((u) => ({ ...u, [p]: data.signedUrl }));
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sign only when a path changes or Try again is pressed
  }, [paths.before, paths.after, tick]);

  const pick = async (kind: Kind, camera: boolean) => {
    const got = await pickPhoto(camera);
    if (!got) return;
    if ("error" in got) { onError(got.error); return; }
    setBusy(kind);
    try {
      const up = await uploadImage({ bucket: "completion-photos", basePath: job.id + "/" + kind + "-" + Crypto.randomUUID(), asset: got, profile: "photo", evidence: true });
      if (!up.ok) { onError(up.message); return; }
      const { error } = await supabase.rpc("save_job_photo", { p_job_id: job.id, p_kind: kind, p_path: up.path });
      if (error) { onError("Couldn't save that photo: " + error.message); return; }
      await onSaved();
    } finally { setBusy(null); }
  };

  const needBefore = beforeRequired(job);
  const missing = photosMissing(job);
  const urgent = missing.length > 0;

  const slot = (kind: Kind, label: string, hint: string) => {
    const p = paths[kind];
    const url = p ? urls[p] : null;
    const optional = kind === "before" && !needBefore;
    const tileStyle = { height: ui.photoPreview, borderRadius: t.r2, alignItems: "center" as const, justifyContent: "center" as const, gap: t.s1, padding: t.s2 };
    return (
      <View style={{ flex: 1, minWidth: 0, gap: t.s1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.s1 }}>
          <Txt variant="label" size={0.74} color={p ? t.success : t.accent500}>{label}</Txt>
          {p ? <Ic name="check-circle" size={ui.icon.sm} color={t.success} />
            : <Txt variant="label" size={0.66} color={optional ? rgba(t.muted, 0.7) : t.accent500}>{optional ? "OPTIONAL" : "REQUIRED"}</Txt>}
        </View>
        {url ? (
          <Image source={{ uri: url }} accessibilityLabel={label} resizeMode="cover" style={{ height: ui.photoPreview, width: "100%", borderRadius: t.r2 }} />
        ) : p && failed[p] ? (
          <View style={[tileStyle, { borderWidth: t.hairW, borderStyle: "dashed", borderColor: rgba(t.fg, 0.16) }]}>
            <Txt size={0.76} color={rgba(t.muted, 0.7)} style={{ textAlign: "center" }}>{"The photo is saved, but we couldn't load it just now."}</Txt>
            <LinkButton onPress={() => { setFailed((f) => { const n = { ...f }; delete n[p]; return n; }); setTick((x) => x + 1); }}>Try again</LinkButton>
          </View>
        ) : p ? (
          <View style={[tileStyle, { backgroundColor: rgba(t.fg, 0.05) }]} />
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={"Add the " + kind + " photo"} disabled={busy !== null} onPress={() => void pick(kind, false)}
            style={[tileStyle, { borderWidth: ui.line, borderStyle: "dashed", borderColor: optional ? rgba(t.fg, 0.18) : rgba(t.accentRgb, 0.45), backgroundColor: optional ? rgba(t.fg, 0.03) : rgba(t.accentRgb, 0.07) }]}>
            <Ic name="camera" size={ui.icon.xl} color={t.accent500} />
            <Txt size={0.82} variant="bodyMedium">{busy === kind ? "Uploading…" : "Choose photo"}</Txt>
            <Txt size={0.7} color={rgba(t.muted, 0.6)} style={{ textAlign: "center" }}>{hint}</Txt>
          </Pressable>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: t.s3 }}>
          <LinkButton onPress={() => { if (busy === null) void pick(kind, true); }}>{busy === kind ? "Uploading…" : "Take photo"}</LinkButton>
          {p ? <LinkButton onPress={() => { if (busy === null) void pick(kind, false); }}>Replace</LinkButton> : null}
        </View>
      </View>
    );
  };

  return (
    <View style={{ padding: t.s4, gap: t.s2, borderRadius: t.r3, backgroundColor: urgent ? rgba(t.accentRgb, 0.09) : rgba(t.fg, 0.03),
      borderWidth: urgent ? ui.edge : t.hairW, borderColor: urgent ? rgba(t.accentRgb, 0.55) : rgba(t.fg, 0.08) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.s2, flexWrap: "wrap" }}>
        <Ic name="camera" size={ui.icon.md} color={t.accent500} />
        <Txt variant="bodyBold" size={urgent ? 0.92 : 0.85}>Before & after photos</Txt>
        {urgent ? <Txt variant="label" size={0.66} color={t.accent500}>REQUIRED TO GET PAID</Txt> : <Ic name="check-circle" size={ui.icon.sm} color={t.success} />}
      </View>
      <Txt size={0.82} lh={1.45} color={urgent ? t.text : rgba(t.muted, 0.65)}>
        {urgent
          ? "You still need " + missing.join(" and ") + ". Take one when you arrive and one when you're done — the finished-work photo is what lets the client confirm and release your payment."
          : "Both photos are in. The client can see exactly what changed."}
      </Txt>
      <View style={{ flexDirection: "row", gap: t.s3 }}>
        {slot("before", "BEFORE", "The work area as you found it")}
        {slot("after", "AFTER — FINISHED WORK", "The finished job")}
      </View>
    </View>
  );
}
