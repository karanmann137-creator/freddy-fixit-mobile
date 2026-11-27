// The Messages inbox state, ONE per role area (mounted in src/app/client/_layout.tsx
// and src/app/contractor/_layout.tsx), so the tab-bar badge, the Messages tab and
// every chat screen read the SAME two hooks. Web rule (MessagesInbox.tsx): "the
// sidebar badge and this list are literally the same array and can't disagree".
//
// Both halves are the synced web hooks: `useConversations` (job threads,
// my_conversations) and `useBidThreads` (pre-hire threads, my_bid_threads), each
// with its own realtime channel and a CHAT_CHANGED_EVENT listener over the native
// bus. This file merges them exactly as both web dashboards do, and adds the one
// thing a phone needs: who "me" is comes from the role's data provider, which can
// still be loading or have failed, and neither of those is "no messages".
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useConversations, announceChatChange, markJobRead, type Conversation } from "@/lib/chatUnread";
import { useBidThreads, bidToConversation, bidRowKey, markBidThreadRead, type BidThread } from "@/lib/bidThreads";
import { useClientData } from "@/features/client/data";
import { useContractorData } from "@/features/contractor/data";
import type { ChatRole } from "./webChat";

type Me = { kind: "loading" } | { kind: "error" } | { kind: "ok"; id: string };

type Live = {
  rows: Conversation[];
  convLoading: boolean; convError: boolean;
  bidLoading: boolean; bidError: boolean;
  totalUnread: number;
  byJob: Record<string, Conversation>;
  byKey: Record<string, BidThread>;
  refresh: () => Promise<void>;
  markJob: (jobId: string) => Promise<void>;
  markBid: (requestId: string, contractorId: string) => Promise<void>;
};

export type ChatInbox = {
  role: ChatRole;
  me: Me;
  /** Re-run the role's own reads (who I am, my jobs). */
  reloadMe: () => Promise<void>;
  /** Contractor only: `contractors.stripe_payouts_enabled`; undefined = we don't know (fails open, as web). */
  payoutsEnabled?: boolean;
  /** Merged inbox, newest first (web inboxRows). */
  rows: Conversation[];
  /** Web inboxLoading: only while there is nothing to show. */
  loading: boolean;
  /** Couldn't tell at all: who I am failed, or BOTH halves failed (web inboxError). */
  error: boolean;
  /** One half failed: the list shown may be missing conversations. Never read as "no messages". */
  partial: boolean;
  /** Badge total: both halves, or a pre-hire question makes no badge anywhere (web msgUnread). */
  totalUnread: number;
  convByJob: Record<string, Conversation>;
  bidByKey: Record<string, BidThread>;
  refresh: () => Promise<void>;
  /** Clear a job thread's badge now, tell the server, then tell every mounted view (web JobChat.markRead). */
  markJob: (jobId: string) => void;
  /** Clear a bid thread's badge now and tell the server (web BidChat onRead → bid.markRead). */
  markBid: (requestId: string, contractorId: string) => void;
};

const Ctx = createContext<ChatInbox | null>(null);

/** Runs the two web hooks for one known user and reports up. Keyed on the user id, so a
 *  fresh mount starts in `loading` (the hooks only start loading on mount). */
function LiveInbox({ meId, onValue }: { meId: string; onValue: (v: Live | null) => void }) {
  const conv = useConversations(meId);
  const bid = useBidThreads(meId);
  const { conversations, loading: convLoading, error: convError, totalUnread, byJob, refresh: convRefresh, markRead: convMark } = conv;
  const { started, threads, loading: bidLoading, error: bidError, totalUnread: bidUnread, byKey, refresh: bidRefresh, markRead: bidMark } = bid;

  const value = useMemo<Live>(() => ({
    // ONE list. Only STARTED bid threads join it (web bidThreadStarted): the client
    // branch returns a row per bidder, which would fill the inbox with empty rows.
    rows: [...conversations, ...started.map((t) => bidToConversation(t, meId))]
      .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? "")),
    convLoading, convError, bidLoading, bidError,
    totalUnread: totalUnread + bidUnread,
    byJob, byKey,
    refresh: async () => { await Promise.all([convRefresh(), bidRefresh()]); },
    markJob: convMark,
    markBid: bidMark,
    // `threads` is what `started` and `byKey` are derived from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [conversations, threads, convLoading, convError, bidLoading, bidError, meId, convRefresh, bidRefresh, convMark, bidMark]);

  useEffect(() => { onValue(value); }, [value, onValue]);
  useEffect(() => () => onValue(null), [onValue]);
  return null;
}

export function ChatInboxProvider({ role, me, reloadMe, payoutsEnabled, children }: {
  role: ChatRole; me: Me; reloadMe: () => Promise<void>; payoutsEnabled?: boolean; children: React.ReactNode;
}) {
  const [live, setLive] = useState<Live | null>(null);
  const onValue = useCallback((v: Live | null) => setLive(v), []);
  const meId = me.kind === "ok" ? me.id : null;
  const cur = meId ? live : null;

  // Stable identities on purpose: a chat screen's focus effect depends on these, and
  // a marker that changed on every inbox refresh would re-subscribe the channel and
  // mark read again in a loop (mark → announce → refresh → new marker → mark ...).
  const curRef = useRef<Live | null>(null);
  useEffect(() => { curRef.current = cur; }, [cur]);
  const markJob = useCallback((jobId: string) => {
    // Opening the conversation IS reading it. Optimistic through the hook when it is
    // mounted, then announce so both halves (and the tab badge) re-read.
    const c = curRef.current;
    const p = c ? c.markJob(jobId) : markJobRead(jobId);
    p.then(announceChatChange).catch(() => { /* the badge corrects on the next refresh */ });
  }, []);
  const markBid = useCallback((requestId: string, contractorId: string) => {
    const c = curRef.current;
    const p = c ? c.markBid(requestId, contractorId) : markBidThreadRead(requestId, contractorId);
    p.catch(() => { /* the next refresh corrects it */ });
  }, []);

  const value = useMemo<ChatInbox>(() => {
    const rows = cur?.rows ?? [];
    const meWaiting = me.kind === "loading";
    const meFailed = me.kind === "error";
    return {
      role, me, reloadMe, payoutsEnabled,
      rows,
      loading: meWaiting || (!meFailed && (!cur || ((cur.convLoading || cur.bidLoading) && rows.length === 0))),
      error: meFailed || (!!cur && cur.convError && cur.bidError),
      partial: !!cur && (cur.convError !== cur.bidError),
      totalUnread: cur?.totalUnread ?? 0,
      convByJob: cur?.byJob ?? {},
      bidByKey: cur?.byKey ?? {},
      refresh: async () => {
        if (meFailed) { await reloadMe(); return; }
        await cur?.refresh();
      },
      markJob, markBid,
    };
  }, [role, me, reloadMe, payoutsEnabled, cur, markJob, markBid]);

  return (
    <Ctx.Provider value={value}>
      {meId ? <LiveInbox key={meId} meId={meId} onValue={onValue} /> : null}
      {children}
    </Ctx.Provider>
  );
}

export function useChatInbox(): ChatInbox {
  const c = useContext(Ctx);
  if (!c) throw new Error("useChatInbox outside ChatInboxProvider");
  return c;
}

/** Tab-bar badge text, or nothing. Same 9+ cap as web's inbox rows. */
export function unreadBadge(n: number): string | number | undefined {
  return n > 0 ? (n > 9 ? "9+" : n) : undefined;
}

export { bidRowKey };

/* ── The two role bridges (mounted once each, in the role's _layout) ─────── */

export function ClientChatInbox({ children }: { children: React.ReactNode }) {
  const { state, reload } = useClientData();
  const id = state.kind === "ok" ? state.data.userId : state.kind === "error" ? state.last?.userId ?? null : null;
  const me: Me = id ? { kind: "ok", id } : state.kind === "error" ? { kind: "error" } : { kind: "loading" };
  return <ChatInboxProvider role="client" me={useStableMe(me)} reloadMe={reload}>{children}</ChatInboxProvider>;
}

export function ContractorChatInbox({ children }: { children: React.ReactNode }) {
  const { state, reload } = useContractorData();
  const d = state.kind === "ok" ? state.data : null;
  const me: Me = d ? { kind: "ok", id: d.userId } : state.kind === "error" ? { kind: "error" } : { kind: "loading" };
  // Web payoutLockCtx: `!!contractor.stripe_payouts_enabled`. No contractor row read
  // (loading/failed) leaves it undefined, which keeps the chat open (chatReadOnly fails open).
  const payoutsEnabled = d?.contractor ? !!d.contractor.stripe_payouts_enabled : undefined;
  return <ChatInboxProvider role="contractor" me={useStableMe(me)} reloadMe={reload} payoutsEnabled={payoutsEnabled}>{children}</ChatInboxProvider>;
}

/** Same object while the meaning is the same, so the context doesn't churn on every data reload. */
function useStableMe(me: Me): Me {
  const key = me.kind === "ok" ? "ok:" + me.id : me.kind;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => me, [key]);
}
