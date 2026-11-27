// The Messages tab (PLAN step 4.12), both roles: port of web components/MessagesInbox.tsx.
// Deliberately dumb, as on web: it renders the area's ChatInboxProvider rows (the
// same array the tab badge counts) and hands a row to a chat screen on tap. It
// never queries, counts or decides what "unread" means.
//
// Three outcomes, never two. A failed read is "couldn't load" + Try again, never
// "No conversations yet". Stricter than web in one place: web shows the error state
// only when BOTH halves failed, so one failing half with an empty other half read as
// "no conversations". Here any failed half with nothing to show is the error state,
// and a failed half beside a working one says so above the list.
import React from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, Ic, Pill, Row, Screen, ScreenHeader, SkRow, Txt, rgba, ui, useDelayed, useTheme } from "@/kit";
import { conversationKey, inboxTime, type Conversation } from "@/lib/chatUnread";
import { useChatInbox } from "./inbox";
import { initials, partyName } from "./webChat";
import { bidChatHref, jobChatHref } from "./routes";

export function InboxScreen() {
  const { t } = useTheme();
  const inbox = useChatInbox();
  const showSkeleton = useDelayed();
  const { rows, role, me } = inbox;
  const meId = me.kind === "ok" ? me.id : null;

  const open = (c: Conversation) => {
    // A bid row FIRST, before any job lookup: its job_id is the synthetic
    // bid:<request>:<pro> key, not a uuid, matching no job (web openConversation).
    if (c.kind === "bid") {
      if (c.request_id && c.contractor_id) router.push(bidChatHref(role, c.request_id, c.contractor_id));
      return;
    }
    router.push(jobChatHref(role, c.job_id));
  };

  const failedBranch = inbox.error || (rows.length === 0 && inbox.partial);

  return (
    <Screen onRefresh={inbox.refresh}>
      <ScreenHeader title="Messages" back={false} />
      {inbox.loading ? (
        showSkeleton ? <View style={{ paddingTop: t.s4, gap: t.s4 }} accessibilityLabel="Loading your messages"><SkRow /><SkRow /><SkRow /></View> : null
      ) : failedBranch ? (
        <View style={{ marginTop: t.s4, gap: t.s3 }}>
          <Card>
            <Row icon="alert-triangle" tone="warn" title="We couldn't load your messages just now." sub="Your conversations are safe. Pull down or try again." />
          </Card>
          <Button onPress={() => void inbox.refresh()}>Try again</Button>
        </View>
      ) : rows.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: t.s10, paddingHorizontal: t.s4, gap: t.s3 }}>
          <Ic name="message-square" size={ui.icon.xl} color={rgba(t.muted, 0.5)} />
          <Txt variant="label" size={1.5}>No conversations yet</Txt>
          <Txt lh={1.5} color={rgba(t.muted, 0.7)} style={{ textAlign: "center" }}>
            Questions before anyone is hired, and everything once a job is underway, all land here — messages, photos, running late.
          </Txt>
        </View>
      ) : (
        <View style={{ marginTop: t.s3, gap: t.s2 }}>
          {inbox.partial ? (
            <Txt size={0.8} color={t.warn} onPress={() => void inbox.refresh()} style={{ marginBottom: t.s1 }}>
              Some conversations couldn&apos;t load. Tap to try again.
            </Txt>
          ) : null}
          {rows.map((c) => <InboxRow key={conversationKey(c)} c={c} meId={meId} onPress={() => open(c)} />)}
        </View>
      )}
    </Screen>
  );
}

function InboxRow({ c, meId, onPress }: { c: Conversation; meId: string | null; onPress: () => void }) {
  const { t } = useTheme();
  const name = partyName(c);
  const unread = c.unread > 0;
  // A snippet the reader sent reads oddly without a marker; an attachment-only message has no text.
  const mine = !!meId && c.last_sender_id === meId;
  const snippet = c.last_snippet
    ? (mine ? "You: " : "") + c.last_snippet
    : c.last_has_attachment ? (mine ? "You sent a photo" : "Sent a photo")
    : "No messages yet — say hello";
  const badge = c.unread > 9 ? "9+" : String(c.unread);
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={name + (unread ? ", " + c.unread + " unread" : "") + ". " + snippet}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "flex-start", gap: t.s3, minHeight: t.hCtl, padding: t.s3, borderRadius: t.r3,
        backgroundColor: unread ? rgba(t.accentRgb, 0.08) : t.cardBg, borderWidth: ui.line, borderColor: unread ? rgba(t.accentRgb, 0.18) : t.cardBorder, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ width: ui.mark + ui.nudge2 * 3, height: ui.mark + ui.nudge2 * 3, borderRadius: ui.pill, alignItems: "center", justifyContent: "center",
        backgroundColor: rgba(t.fg, 0.08), borderWidth: ui.line, borderColor: rgba(t.fg, 0.12) }}>
        <Txt variant="label" size={1}>{initials(name)}</Txt>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: t.s2 }}>
          <Txt variant={unread ? "bodyBold" : "bodyMedium"} size={0.92} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>{name}</Txt>
          <Txt size={0.72} color={rgba(t.muted, 0.55)}>{inboxTime(c.last_message_at)}</Txt>
        </View>
        <Txt size={0.82} lh={1.45} numberOfLines={1} color={unread ? t.text : rgba(t.muted, 0.7)} style={{ marginTop: ui.nudge2 }}>{snippet}</Txt>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: t.s2, marginTop: t.s1 }}>
          {/* A bid row is about a job that doesn't exist yet: saying so stops it reading as a lost job. */}
          {c.kind === "bid" ? <Pill>Before hiring</Pill> : null}
          {c.service_needed ? <Pill>{c.service_needed}</Pill> : null}
          {c.location ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: t.s1, flexShrink: 1, minWidth: 0 }}>
              <Ic name="map-pin" size={ui.icon.xs} color={rgba(t.muted, 0.55)} />
              <Txt size={0.72} numberOfLines={1} color={rgba(t.muted, 0.55)} style={{ flexShrink: 1 }}>{c.location}</Txt>
            </View>
          ) : null}
        </View>
      </View>
      {unread ? (
        <View style={{ minWidth: ui.badge + ui.nudge2 * 2, height: ui.badge + ui.nudge2 * 2, paddingHorizontal: t.s1, borderRadius: ui.pill, backgroundColor: t.accent500, alignItems: "center", justifyContent: "center", alignSelf: "center" }}>
          <Txt variant="bodyBold" size={0.7} color="#fff" /* rule-ok: web badge text is white */>{badge}</Txt>
        </View>
      ) : null}
    </Pressable>
  );
}
