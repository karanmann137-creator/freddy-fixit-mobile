// BidChat (PLAN step 4.11): port of web components/BidChat.tsx. A private thread
// between the client and ONE pro who bid, before any job exists.
//
// The two load-bearing rules live in the DATABASE, not here: the CLIENT opens the
// thread (a pro can only reply), and a pro sees only their own thread. So, as on
// web, a pro's Send is not pre-gated here: the server refuses, and we say why.
// Photos only (no video), at <request_id>/<contractor_id>/<file>, the shape
// bid_media_path_ok checks; the contractor segment is whose THREAD this is.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, FlatList, View, TextInput } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { ImagePickerAsset } from "expo-image-picker";
import { Button, DeadEnd, Screen, ScreenHeader, SkRow, Txt, rgba, useDelayed, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { announceChatChange, daySeparator, isNewDay } from "@/lib/chatUnread";
import { uploadImage } from "@/platform/upload";
import { bidRowKey, useChatInbox } from "./inbox";
import { AttachSheet, Bubble, ComposerNote, ComposerRow, DaySep, PendingPreview, extOfAsset, nextTopic, toUploadAsset, useSignedUrls, type Msg, type Pending } from "./parts";
import { BID_COLS, BID_IMAGE_EXTS, BUCKET, COPY, IMAGE_TYPES, MAX_IMAGE } from "./webChat";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `contractorId`: whose thread. The client route passes the pro; the contractor route passes nothing (it is me). */
export function BidChatScreen({ requestId, contractorId: proParam }: { requestId: string; contractorId?: string }) {
  const { t } = useTheme();
  const inbox = useChatInbox();
  const { role, me, markBid, reloadMe } = inbox;
  const meId = me.kind === "ok" ? me.id : null;
  const contractorId = role === "contractor" ? meId : proParam ?? null;
  const validIds = UUID.test(requestId) && (role === "contractor" || UUID.test(proParam ?? ""));
  const showSkeleton = useDelayed();

  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [failed, setFailed] = useState(false);
  const { urls, sign } = useSignedUrls();
  const seq = useRef(0);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const inputRef = useRef<React.ComponentRef<typeof TextInput> | null>(null);
  const listRef = useRef<FlatList<Msg> | null>(null);

  const load = useCallback(async () => {
    if (!validIds || !contractorId) return;
    const mine = ++seq.current;
    let rows: Msg[] | null = null;
    try {
      const { data, error } = await supabase.from("messages").select(BID_COLS)
        .eq("request_id", requestId).eq("thread_contractor_id", contractorId)
        .order("created_at", { ascending: true });
      rows = error ? null : ((data ?? []) as Msg[]);
    } catch { rows = null; }
    if (mine !== seq.current) return;
    // A failed read is not an empty conversation: say so rather than "no messages yet".
    if (!rows) { setFailed(true); return; }
    setFailed(false);
    setMsgs(rows);
    void sign(rows);
  }, [validIds, contractorId, requestId, sign]);

  useFocusEffect(useCallback(() => {
    if (!validIds || !contractorId || !meId) return;
    void load();
    markBid(requestId, contractorId);
    // Realtime can filter on one column only: filter on the request, narrow to this
    // pro's thread in the handler.
    const channel = supabase.channel("bidchat-" + requestId + "-" + contractorId + ":" + nextTopic())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `request_id=eq.${requestId}` }, (payload) => {
        const m = payload.new as Msg;
        if (m.thread_contractor_id !== contractorId) return;
        setMsgs((prev) => (prev?.some((x) => x.id === m.id) ? prev : [...(prev ?? []), m]));
        if (m.attachment_path) void sign([m]);
        if (m.sender_id !== meId && AppState.currentState === "active") markBid(requestId, contractorId);
      })
      .subscribe();
    const app = AppState.addEventListener("change", (s) => { if (s === "active") { void load(); markBid(requestId, contractorId); } });
    return () => {
      app.remove();
      void supabase.removeChannel(channel);
    };
  }, [validIds, contractorId, meId, requestId, load, markBid, sign]));

  useEffect(() => {
    const id = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [msgs?.length, pending]);

  const backToMessages = () => router.navigate(role === "client" ? "/client/messages" : "/contractor/messages");
  if (!validIds) return <DeadEnd retry={false} msg="This conversation link isn't right." alt={<Button onPress={backToMessages}>Go to Messages</Button>} />;
  if (me.kind === "error") return <DeadEnd msg="We couldn't load your account. Check your connection, then try again." onRetry={() => void reloadMe()} />;

  const th = contractorId ? inbox.bidByKey[bidRowKey(requestId, contractorId)] : undefined;
  const otherName = th?.other_company || th?.other_name || (role === "client" ? "Contractor" : "Client");
  const title = th?.service_needed ?? null;

  const pickAsset = (a: ImagePickerAsset) => {
    setErr("");
    // HEIC off an iPhone often arrives with an empty type: fall back to the extension.
    const mime = (a.mimeType || "").toLowerCase();
    const looksImage = a.type !== "video" && (mime ? IMAGE_TYPES.includes(mime) : BID_IMAGE_EXTS.includes(extOfAsset(a)));
    if (!looksImage) { setErr(COPY.bidTypes); return; }
    if (typeof a.fileSize === "number" && a.fileSize > MAX_IMAGE) { setErr(COPY.bidImageBig); return; }
    setPending({ asset: toUploadAsset(a), kind: "image" });
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && !pending) || sending || !meId || !contractorId) return;
    setSending(true);
    setErr("");
    let attachment_path: string | null = null;
    let attachment_type: string | null = null;
    try {
      if (pending) {
        // compressImage returns the ORIGINAL on every failure path, so this can shrink a
        // photo but never lose one. The fail-open scan sits between upload and insert.
        const up = await uploadImage({ bucket: BUCKET, basePath: requestId + "/" + contractorId + "/" + meId + "-" + Date.now(), asset: pending.asset, profile: "photo" });
        if (!up.ok) {
          setErr(up.blocked ? up.message : role === "contractor" ? COPY.bidUploadFailedPro : COPY.bidUploadFailed);
          return;
        }
        attachment_path = up.path;
        attachment_type = "image";
      }
      const { data, error } = await supabase.from("messages")
        .insert({ request_id: requestId, thread_contractor_id: contractorId, sender_id: meId, content: body, attachment_path, attachment_type })
        .select(BID_COLS).maybeSingle();
      if (error) { setErr(role === "contractor" ? COPY.bidSendFailedPro : COPY.bidSendFailed); return; }
      setText("");
      setPending(null);
      if (data) {
        // A blocked row comes back here too and renders struck through with the
        // server's reason under it (web BidChat): never silently dropped.
        const saved = data as Msg;
        setMsgs((prev) => (prev?.some((x) => x.id === saved.id) ? prev : [...(prev ?? []), saved]));
        if (saved.attachment_path) void sign([saved]);
      } else {
        void load();
      }
      // The recipient's inbox hears it over realtime; the SENDER's own inbox row needs this.
      announceChatChange();
    } finally {
      setSending(false);
    }
  };

  const canSend = (!!text.trim() || !!pending) && !sending;

  return (
    <Screen scroll={false} contentStyle={{ paddingHorizontal: 0, paddingBottom: 0 }}>
      <View style={{ paddingHorizontal: t.s4 }}>
        <ScreenHeader title={otherName} />
        {title ? <Txt size={0.75} color={rgba(t.muted, 0.55)} numberOfLines={1}>{title} · before you book</Txt> : null}
      </View>

      <View style={{ flex: 1, marginTop: t.s3, borderTopWidth: t.hairW, borderTopColor: t.hair }}>
        {msgs === null && !failed ? (
          showSkeleton ? <View style={{ padding: t.s4, gap: t.s4 }} accessibilityLabel="Loading this conversation"><SkRow /><SkRow /><SkRow /></View> : null
        ) : failed && !msgs?.length ? (
          <View style={{ padding: t.s6, alignItems: "center", gap: t.s4 }}>
            <Txt color={t.warn} lh={1.5} style={{ textAlign: "center" }}>{COPY.bidLoadFailed}</Txt>
            <Button onPress={() => void load()}>Try again</Button>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={msgs ?? []}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: t.s4, gap: t.s1, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListHeaderComponent={failed ? (
              <Txt size={0.78} color={t.warn} style={{ textAlign: "center", marginBottom: t.s2 }} onPress={() => void load()}>
                Couldn&apos;t refresh this conversation. Tap to try again.
              </Txt>
            ) : undefined}
            ListEmptyComponent={
              <Txt size={0.85} lh={1.5} color={rgba(t.muted, 0.55)} style={{ textAlign: "center", marginTop: t.s6, paddingHorizontal: t.s4 }}>
                {role === "client" ? COPY.bidEmptyClient : COPY.bidEmptyPro}
              </Txt>
            }
            renderItem={({ item, index }) => {
              const prev = index > 0 ? (msgs ?? [])[index - 1]?.created_at : null;
              const sep = item.created_at && isNewDay(item.created_at, prev) ? daySeparator(item.created_at) : null;
              return (
                <View>
                  {sep ? <DaySep label={sep} /> : null}
                  <Bubble m={item} mine={item.sender_id === meId} blockedNote="instead-of-time"
                    url={item.attachment_path ? urls[item.attachment_path] : undefined} />
                </View>
              );
            }}
          />
        )}
      </View>

      <View style={{ borderTopWidth: t.hairW, borderTopColor: t.hair }}>
        {err ? <ComposerNote tone="danger">{err}</ComposerNote> : null}
        <Txt size={0.7} lh={1.4} color={rgba(t.muted, 0.45)} style={{ paddingHorizontal: t.s4, paddingTop: t.s2 }}>{COPY.bidFooter}</Txt>
        {pending ? <PendingPreview p={pending} onRemove={() => setPending(null)} /> : null}
        <ComposerRow
          value={text} onChange={setText} inputRef={inputRef}
          placeholder={pending ? "Add a caption…" : role === "client" ? "Ask this pro a question…" : "Reply…"}
          onAttach={() => setAttachOpen(true)} attachLabel="Attach a photo"
          onSend={() => void send()} canSend={canSend} sending={sending}
        />
      </View>

      <AttachSheet open={attachOpen} onClose={() => setAttachOpen(false)} videos={false} onPick={pickAsset} onError={setErr} />
    </Screen>
  );
}
