// The pieces only contractor onboarding needs (PLAN 5.2). Ports of the web inputs
// named beside each; the words are web's. No business rules here.
import React, { useState } from "react";
import { Image, Pressable, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { BottomSheet, Ic, Txt, rgba, ui, useTheme } from "@/kit";
import { TIME_OPTIONS } from "@/lib/availability";
import type { UploadAsset } from "@/lib/imageCompress";
import { ChoiceRow, LinkButton } from "@/features/request/pieces";

/** Camera or library → one picked image, or null (cancelled). A file over `maxBytes`
 *  is refused BEFORE compression with web's words (web docFileError / the photo input).
 *  Images only: a PDF needs a document picker this build doesn't have (see the report). */
async function pick(camera: boolean, maxBytes: number, tooBig: string, onError: (m: string) => void): Promise<UploadAsset | null> {
  try {
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { onError("Camera access is off for Freddy Fix It. Turn it on in Settings, or choose a photo you already have."); return null; }
    }
    const r = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (r.canceled) return null;
    const a = r.assets?.[0];
    if (!a) return null; // a cancelled picker returns nothing: keep the file already chosen (web)
    if (typeof a.fileSize === "number" && a.fileSize > maxBytes) { onError(tooBig); return null; }
    return { uri: a.uri, mimeType: a.mimeType ?? null, fileName: a.fileName ?? null, width: a.width, height: a.height };
  } catch {
    onError("Couldn't open your photos. Try again.");
    return null;
  }
}

/** web: the dashed "upload / snap a photo" box for one credential document. */
export function DocSlot({ label, asset, onPick, onRemove, onError, maxBytes, tooBig }: {
  label: string; asset: UploadAsset | null; onPick: (a: UploadAsset) => void; onRemove: () => void; onError: (m: string) => void; maxBytes: number; tooBig: string;
}) {
  const { t } = useTheme();
  const run = async (camera: boolean) => { const a = await pick(camera, maxBytes, tooBig, onError); if (a) onPick(a); };
  return (
    <View>
      <Pressable onPress={() => void run(false)} accessibilityRole="button" accessibilityLabel={asset ? `${label}: added. Choose a different one` : `Add ${label}`}
        style={{ minHeight: t.hCtl, flexDirection: "row", alignItems: "center", gap: t.s3, paddingVertical: t.s3, paddingHorizontal: t.s4, borderRadius: t.r2,
          borderWidth: t.hairW, borderColor: asset ? rgba(t.accentRgb, 0.4) : rgba(t.fg, 0.1), backgroundColor: asset ? rgba(t.accentRgb, 0.08) : rgba(t.fg, 0.04) }}>
        <Ic name={asset ? "check-circle" : "download"} size={ui.icon.md} color={asset ? t.success : rgba(t.muted, 0.6)} rotate={asset ? undefined : 180} />
        <Txt size={0.88} color={asset ? t.text : rgba(t.muted, 0.7)} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
          {asset ? (asset.fileName || "Photo added") : "Choose a photo of it (max 10MB)"}
        </Txt>
      </Pressable>
      <View style={{ flexDirection: "row", gap: t.s5 }}>
        <LinkButton onPress={() => void run(true)}>Take a photo</LinkButton>
        {asset ? <LinkButton onPress={onRemove}>Remove</LinkButton> : null}
      </View>
    </View>
  );
}

/** web: the profile photo box ("Pros with a photo get picked more often"). */
export function AvatarPicker({ asset, onPick, onRemove, onError, maxBytes, tooBig }: {
  asset: UploadAsset | null; onPick: (a: UploadAsset) => void; onRemove: () => void; onError: (m: string) => void; maxBytes: number; tooBig: string;
}) {
  const { t } = useTheme();
  const run = async (camera: boolean) => { const a = await pick(camera, maxBytes, tooBig, onError); if (a) onPick(a); };
  return (
    <View>
      <Pressable onPress={() => void run(false)} accessibilityRole="button" accessibilityLabel={asset ? "Choose a different photo" : "Choose a profile photo"}
        style={{ alignItems: "center", gap: t.s3, paddingVertical: t.s5, paddingHorizontal: t.s4, borderRadius: t.r3,
          borderWidth: ui.edge, borderStyle: "dashed", borderColor: asset ? rgba(t.accentRgb, 0.55) : rgba(t.fg, 0.12) }}>
        {asset ? (
          <Image source={{ uri: asset.uri }} accessibilityIgnoresInvertColors resizeMode="cover"
            style={{ width: ui.photoTile, height: ui.photoTile, borderRadius: ui.pill }} />
        ) : (
          <Ic name="camera" size={ui.icon.xl * 1.8} color={t.text} />
        )}
        <Txt size={0.88} color={rgba(t.muted, 0.7)}>Pros with a photo get picked more often</Txt>
        <Txt variant="bodyMedium" size={0.88}>{asset ? "Tap to choose a different one" : "Choose a photo"}</Txt>
      </Pressable>
      <View style={{ flexDirection: "row", gap: t.s5 }}>
        <LinkButton onPress={() => void run(true)}>Take a photo</LinkButton>
        {asset ? <LinkButton onPress={onRemove}>Remove photo</LinkButton> : null}
      </View>
    </View>
  );
}

/** web: the start/end <select> of TIME_OPTIONS. Native: a field that opens a bottom sheet. */
export function TimeSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  const shown = TIME_OPTIONS.find((o) => o.value === value)?.label ?? value;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}: ${shown}. Change`}
        style={{ flex: 1, minHeight: t.hCtl, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: t.s4,
          borderRadius: t.r2, borderWidth: t.hairW, borderColor: rgba(t.fg, 0.12), backgroundColor: rgba(t.fg, 0.06) }}>
        <Txt>{shown}</Txt>
        <Ic name="chevron-down" size={ui.icon.md} color={rgba(t.muted, 0.7)} />
      </Pressable>
      <BottomSheet open={open} onClose={() => setOpen(false)} label={label}>
        <Txt variant="label" size={1.3} ls={0.04} accessibilityRole="header" style={{ marginBottom: t.s3 }}>{label}</Txt>
        {TIME_OPTIONS.map((o) => (
          <ChoiceRow key={o.value} title={o.label} on={o.value === value} onPress={() => { onChange(o.value); setOpen(false); }} />
        ))}
      </BottomSheet>
    </>
  );
}
