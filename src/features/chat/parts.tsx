// The pieces JobChat and BidChat share: message bubble (with the blocked-message
// note), day separator, attachments (signed URLs, preview, picker) and the
// composer row. No reads or writes of messages here: the two screens own those.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, Keyboard, Platform, Pressable, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet, Button, Card, IconButton, Ic, Row, Sk, Txt, fonts, notify, rgba, ui, useFs, useTheme, type IconName } from "@/kit";
import { supabase } from "@/lib/supabase";
import { blockedReason, BLOCKED_HELP } from "@/lib/chatParse";
import { messageTime } from "@/lib/chatUnread";
import type { UploadAsset } from "@/lib/imageCompress";
import { BUCKET, COPY } from "./webChat";

export type Msg = {
  id: string;
  sender_id: string | null;
  content: string;
  created_at: string | null;
  attachment_path?: string | null;
  attachment_type?: string | null;
  // Written by the messages_chat_guard trigger. RLS only ever shows a blocked row
  // back to the person who sent it: the other side never sees it.
  blocked?: boolean | null;
  flag_reasons?: string[] | null;
  job_id?: string | null;
  request_id?: string | null;
  thread_contractor_id?: string | null;
};

export type Pending = { asset: UploadAsset; kind: "image" | "video" };

const VIDEO_EXT: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

/**
 * A fresh realtime topic per subscription. supabase-js returns the EXISTING channel
 * for a topic it still holds, and a removed channel stays held until the server
 * acknowledges the leave, so a quick blur → focus would re-subscribe a channel that
 * is on its way out and silently receive nothing.
 */
let topicSeq = 0;
export const nextTopic = () => String(++topicSeq);

/* ── Signed URLs (1 hour, cached in state, as web) ─────────────────────── */

export function useSignedUrls() {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const asked = useRef<Set<string>>(new Set());
  /** Sign any attachment paths we don't already hold a URL for. A bid-media object is
   *  unreadable until a message points at it, so this only ever runs AFTER the insert. */
  const sign = useCallback(async (rows: Msg[]) => {
    const need = rows.map((m) => m.attachment_path).filter((p): p is string => !!p && !asked.current.has(p));
    if (!need.length) return;
    need.forEach((p) => asked.current.add(p));
    try {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(need, 60 * 60);
      if (!data) { need.forEach((p) => asked.current.delete(p)); return; }
      setUrls((prev) => {
        const next = { ...prev };
        data.forEach((d) => { if (d.path && d.signedUrl) next[d.path] = d.signedUrl; });
        return next;
      });
      data.forEach((d) => { if (d.path && !d.signedUrl) asked.current.delete(d.path); });
    } catch {
      need.forEach((p) => asked.current.delete(p)); // a later render can try again
    }
  }, []);
  return { urls, sign };
}

function openUrl(url: string) {
  WebBrowser.openBrowserAsync(url).catch(() => notify("Couldn't open that attachment. Try again.", "danger"));
}

/* ── Bubble ─────────────────────────────────────────────────────────────── */

export function Bubble({ m, mine, url, blockedNote = "after" }: {
  m: Msg; mine: boolean; url?: string;
  /** Where the "only you can see this" line goes: JobChat puts the time under the bubble
   *  and the reason after it; BidChat swaps the time for the line (web). */
  blockedNote?: "after" | "instead-of-time";
}) {
  const { t } = useTheme();
  const blocked = !!m.blocked;
  const onlyAttachment = !!m.attachment_path && !m.content;
  const bg = blocked ? rgba(t.dangerRgb, 0.1) : mine ? rgba(t.accentRgb, 0.18) : rgba(t.fg, 0.07);
  const border = blocked ? rgba(t.dangerRgb, 0.45) : mine ? rgba(t.accentRgb, 0.35) : rgba(t.fg, 0.08);
  const align = mine ? "flex-end" : "flex-start";
  const reason = blocked ? blockedReason(m.flag_reasons) : "";
  const time = m.created_at ? messageTime(m.created_at) : "";
  return (
    <View style={{ alignItems: align, marginVertical: t.s1 }}>
      <View style={{ maxWidth: "80%", padding: onlyAttachment ? t.s1 : undefined, paddingHorizontal: onlyAttachment ? undefined : t.s3, paddingVertical: onlyAttachment ? undefined : t.s2,
        borderRadius: t.r3, borderBottomRightRadius: mine ? ui.nudge2 : t.r3, borderBottomLeftRadius: mine ? t.r3 : ui.nudge2,
        backgroundColor: bg, borderWidth: ui.line, borderColor: border, borderStyle: blocked ? "dashed" : "solid", opacity: blocked ? 0.75 : 1 }}>
        {m.attachment_path ? <Attachment type={m.attachment_type} url={url} gap={!!m.content} /> : null}
        {m.content ? (
          <Txt size={0.9} lh={1.5} selectable style={blocked ? { textDecorationLine: "line-through" } : undefined}>{m.content}</Txt>
        ) : null}
      </View>
      {blocked && blockedNote === "instead-of-time" ? (
        <Txt size={0.7} color={rgba(t.muted, 0.5)} style={{ marginTop: t.s1 }}>{COPY.onlyYou.replace(/\.$/, "")}</Txt>
      ) : time ? (
        <Txt size={0.7} color={rgba(t.muted, 0.5)} style={{ marginTop: t.s1, paddingHorizontal: ui.nudge2 }}>{time}</Txt>
      ) : null}
      {blocked ? (
        // The server's reason, said to the sender. Never silently dropped: the other
        // side never sees this row, so this line is the only place it is explained.
        <Txt size={0.75} lh={1.5} color={t.danger} accessibilityLiveRegion="polite"
          style={{ maxWidth: "80%", marginTop: t.s1, textAlign: mine ? "right" : "left" }}>
          {blockedNote === "after" ? reason + " " + COPY.onlyYou : (reason || BLOCKED_HELP)}
        </Txt>
      ) : null}
    </View>
  );
}

function Attachment({ type, url, gap }: { type?: string | null; url?: string; gap: boolean }) {
  const { t } = useTheme();
  const mb = gap ? t.s2 : 0;
  if (!url) {
    // A signed URL is still being minted: hold the rough shape so the bubble doesn't jump.
    return <View style={{ marginBottom: mb }} accessibilityLabel="Loading attachment"><Sk w={200} h={140} r={t.r2} /></View>;
  }
  if (type === "video") {
    // No in-app video player in this build: the system browser plays it.
    return (
      <Pressable onPress={() => openUrl(url)} accessibilityRole="button" accessibilityLabel="Play video"
        style={{ marginBottom: mb, minHeight: t.hCtl, minWidth: 200, flexDirection: "row", alignItems: "center", gap: t.s2, padding: t.s3,
          borderRadius: t.r2, backgroundColor: rgba(t.fg, 0.08) }}>
        <Ic name="file" size={ui.icon.lg} />
        <Txt size={0.85}>Video · tap to play</Txt>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={() => openUrl(url)} accessibilityRole="imagebutton" accessibilityLabel="Open photo" style={{ marginBottom: mb }}>
      <Image source={{ uri: url }} accessibilityIgnoresInvertColors resizeMode="cover"
        style={{ width: 220, height: 160, borderRadius: t.r2 }} />
    </Pressable>
  );
}

export function DaySep({ label }: { label: string }) {
  const { t } = useTheme();
  return (
    <View style={{ alignSelf: "center", marginTop: t.s3, marginBottom: t.s1, paddingHorizontal: t.s3, paddingVertical: ui.nudge2, borderRadius: ui.pill, backgroundColor: rgba(t.fg, 0.05) }}>
      <Txt size={0.7} color={rgba(t.muted, 0.55)}>{label}</Txt>
    </View>
  );
}

export function EventLine({ icon, text, time }: { icon: IconName; text: string; time: string }) {
  const { t } = useTheme();
  return (
    <View style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: t.s1, paddingVertical: ui.nudge2, maxWidth: "90%" }}>
      <Ic name={icon} size={ui.icon.xs} color={rgba(t.muted, 0.55)} />
      <Txt size={0.72} color={rgba(t.muted, 0.6)} style={{ textAlign: "center", flexShrink: 1 }}>{text}{time ? " · " + time : ""}</Txt>
    </View>
  );
}

/** A small action chip (web .chip / .chipHot). `hot` = tinted, never a solid orange fill. */
export function ChatChip({ label, icon, hot, onPress, disabled }: { label: string; icon?: IconName; hot?: boolean; onPress: () => void; disabled?: boolean }) {
  const { t } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
      style={{ minHeight: t.hCtl, flexDirection: "row", alignItems: "center", gap: t.s1, paddingHorizontal: t.s3, borderRadius: ui.pill, opacity: disabled ? 0.5 : 1,
        borderWidth: ui.line, borderColor: hot ? rgba(t.accentRgb, 0.35) : rgba(t.fg, 0.1), backgroundColor: hot ? rgba(t.accentRgb, 0.12) : rgba(t.fg, 0.06) }}>
      {icon ? <Ic name={icon} size={ui.icon.sm} color={hot ? t.text : rgba(t.muted, 0.85)} /> : null}
      <Txt size={0.8} color={hot ? t.text : rgba(t.muted, 0.85)} style={{ flexShrink: 1 }}>{label}</Txt>
    </Pressable>
  );
}

/** A line of feedback above the composer: the error/blocked banner or a success notice. */
export function ComposerNote({ tone, children }: { tone: "danger" | "good"; children: string }) {
  const { t } = useTheme();
  const c = tone === "danger" ? { fg: t.danger, rgb: t.dangerRgb } : { fg: t.success, rgb: t.successRgb };
  return (
    <View accessibilityLiveRegion="polite" style={{ paddingHorizontal: t.s4, paddingVertical: t.s2, backgroundColor: rgba(c.rgb, 0.08) }}>
      <Txt size={0.8} lh={1.5} color={c.fg}>{children}</Txt>
    </View>
  );
}

/* ── Picking an attachment ──────────────────────────────────────────────── */

/**
 * Camera or library, then the caller's own type/size check (web pickFile). A cancelled
 * picker returns nothing (`if (!a) return`). Camera is photos only: recording video
 * would need the microphone permission this build doesn't declare.
 */
export function AttachSheet({ open, onClose, videos, onPick, onError }: {
  open: boolean; onClose: () => void; videos: boolean;
  onPick: (a: ImagePicker.ImagePickerAsset) => void; onError: (msg: string) => void;
}) {
  const pick = async (camera: boolean) => {
    onClose();
    // iOS can't present the picker while this sheet's modal is still sliding away:
    // it would fail without an error. Let the sheet finish closing first.
    if (Platform.OS === "ios") await new Promise((r) => setTimeout(r, 450));
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { onError("Camera access is off for Freddy Fix It. Turn it on in Settings, or choose a photo you already have."); return; }
      }
      const r = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: videos ? ["images", "videos"] : ["images"], quality: 1 });
      if (r.canceled) return;
      const a = r.assets?.[0];
      if (!a) return;
      onPick(a);
    } catch {
      onError("Couldn't open your photos. Try again.");
    }
  };
  return (
    <BottomSheet open={open} onClose={onClose} label={videos ? "Attach a photo or video" : "Attach a photo"}>
      <Card>
        <Row icon="camera" tone="neutral" title="Take a photo" chevron onPress={() => void pick(true)} />
        <Row icon="file" tone="neutral" title={videos ? "Choose a photo or video" : "Choose a photo"} chevron onPress={() => void pick(false)} />
      </Card>
    </BottomSheet>
  );
}

/** The picker asset as upload.ts takes it. A video with no file name gets one from its
 *  type, so the storage path keeps its real extension (web takes it off the file name). */
export function toUploadAsset(a: ImagePicker.ImagePickerAsset): UploadAsset {
  let fileName = a.fileName ?? null;
  const mime = a.mimeType ?? null;
  if (!fileName && mime && VIDEO_EXT[mime]) fileName = "video." + VIDEO_EXT[mime];
  return { uri: a.uri, mimeType: mime, fileName, width: a.width, height: a.height };
}

/** The extension of a picked file, for the HEIC/empty-type fallback. */
export function extOfAsset(a: ImagePicker.ImagePickerAsset): string {
  const n = (a.fileName || a.uri.split("?")[0]).split(".");
  return n.length > 1 ? n.pop()!.toLowerCase() : "";
}

export function PendingPreview({ p, onRemove }: { p: Pending; onRemove: () => void }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: t.s3, paddingHorizontal: t.s4, paddingTop: t.s2 }}>
      {p.kind === "image"
        ? <Image source={{ uri: p.asset.uri }} accessibilityIgnoresInvertColors resizeMode="cover" style={{ width: ui.photoTile * 0.7, height: ui.photoTile * 0.7, borderRadius: t.r2 }} />
        : <View style={{ width: ui.photoTile * 0.7, height: ui.photoTile * 0.7, borderRadius: t.r2, alignItems: "center", justifyContent: "center", backgroundColor: rgba(t.fg, 0.08) }}><Ic name="file" /></View>}
      <Txt size={0.8} color={rgba(t.muted, 0.7)} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>{p.asset.fileName ?? (p.kind === "image" ? "Photo" : "Video")}</Txt>
      <IconButton label="Remove attachment" onPress={onRemove}><Ic name="x-circle" size={ui.icon.lg} /></IconButton>
    </View>
  );
}

/** Bottom padding for a footer pinned above the home indicator. While the keyboard is
 *  up the keyboard covers that area, so the inset would only add a gap above it. */
export function useBottomPad(): number {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const [kb, setKb] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setKb(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKb(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return kb ? t.s3 : Math.max(insets.bottom, t.s3);
}

/** Attach + text box + Send. Send is the screen's one primary button. */
export function ComposerRow({ value, onChange, placeholder, onAttach, onSend, canSend, sending, inputRef, attachLabel }: {
  value: string; onChange: (v: string) => void; placeholder: string;
  onAttach: () => void; onSend: () => void; canSend: boolean; sending: boolean;
  inputRef?: React.RefObject<React.ComponentRef<typeof TextInput> | null>; attachLabel: string;
}) {
  const { t } = useTheme();
  const fs = useFs();
  const pb = useBottomPad();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: t.s2, paddingHorizontal: t.s4, paddingTop: t.s3, paddingBottom: pb }}>
      <IconButton label={attachLabel} onPress={sending ? undefined : onAttach}><Ic name="camera" size={ui.icon.lg} /></IconButton>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        accessibilityLabel="Message"
        multiline
        placeholderTextColor={rgba(t.muted, 0.45)}
        selectionColor={t.accent500}
        style={{ flex: 1, minWidth: 0, minHeight: t.hCtl, maxHeight: ui.textareaH, paddingHorizontal: t.s3, paddingTop: t.s3, paddingBottom: t.s3,
          borderRadius: t.r2, borderWidth: t.hairW, borderColor: rgba(t.fg, 0.12), backgroundColor: rgba(t.fg, 0.06),
          color: t.text, fontFamily: fonts.body, fontSize: Math.max(ui.inputMin, fs(1)), textAlignVertical: "top" }}
      />
      <Button variant="primary" onPress={onSend} disabled={!canSend} loading={sending}>Send</Button>
    </View>
  );
}
