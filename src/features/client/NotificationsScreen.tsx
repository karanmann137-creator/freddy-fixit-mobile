// Notifications list (PLAN step 4.19): port of the web bell (components/NotificationBell.tsx).
// Reads the user's own `notifications` rows (RLS scopes them), newest first, 30 of
// them, as web does. Three outcomes: a failed read is "couldn't load" + retry, never
// "You're all caught up". A tap marks the row read and goes where `noteTarget` says.
//
// Not ported: the realtime channel and the 2-minute poll. A pushed screen re-reads on
// open and on pull-down; push notifications arrive in Phase 6.
import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Button, Card, DeadEnd, Row, Screen, ScreenHeader, SkRow, notify, useDelayed, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { noteTarget } from "@/lib/notificationRoutes";
import { useClientData } from "./data";
import { openOnWeb } from "./web";

type Note = {
  id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  job_id: string | null;
  read_at: string | null;
  created_at: string;
};

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ok"; notes: Note[] };

const DASHBOARD = "/client-dashboard";

type Dest = { app: "/client" | "/client/history" | "/client/recurring" | "/client/account" } | { web: string };

/** Where a tapped notification goes. The tab names come from web's CLIENT_TAB map via noteTarget. */
export function destinationFor(n: Pick<Note, "type" | "job_id">): Dest {
  const tg = noteTarget(n.type, n.job_id, DASHBOARD);
  // A dedicated web page (e.g. the contractor guide), not a dashboard tab.
  if (tg.path !== DASHBOARD) return { web: tg.path };
  switch (tg.tab) {
    case undefined: // an unknown type lands on the dashboard root, as on web
    case "requests": return { app: "/client" };
    case "history": return { app: "/client/history" };
    case "recurring": return { app: "/client/recurring" };
    case "profile":
    case "settings": return { app: "/client/account" };
    default: return { web: DASHBOARD + "?tab=" + encodeURIComponent(tg.tab) };
  }
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(s) || s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

async function readNotes(userId: string): Promise<Load> {
  try {
    const { data, error } = await supabase.from("notifications").select("*").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(30);
    return error ? { kind: "error" } : { kind: "ok", notes: (data as Note[] | null) ?? [] };
  } catch {
    return { kind: "error" };
  }
}

/** Unread count for the Requests tab's bell. A failed read is `null` = no badge, never an error screen. */
export function useUnreadCount(userId: string | null): number | null {
  const [res, setRes] = useState<{ userId: string; n: number | null } | null>(null);
  // Re-read each time the tab regains focus, so the badge clears after the list is read.
  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let stale = false;
    void (async () => {
      let n: number | null = null;
      try {
        const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true })
          .eq("user_id", userId).is("read_at", null);
        n = error ? null : (count ?? null);
      } catch { n = null; }
      if (!stale) setRes({ userId, n });
    })();
    return () => { stale = true; };
  }, [userId]));
  return res && res.userId === userId ? res.n : null;
}

export function NotificationsScreen() {
  const { t } = useTheme();
  const { state, reload } = useClientData();
  const showSkeleton = useDelayed();
  const userId = state.kind === "ok" ? state.data.userId : null;
  const [load, setLoad] = useState<{ userId: string; nonce: number; res: Load } | null>(null);
  const [nonce, setNonce] = useState(0);
  // Rows marked read locally (optimistic, as web) on top of what was read.
  const [localRead, setLocalRead] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!userId) return;
    let stale = false;
    void readNotes(userId).then((res) => { if (!stale) setLoad({ userId, nonce, res }); });
    return () => { stale = true; };
  }, [userId, nonce]);

  const cur: Load = userId && load && load.userId === userId && load.nonce === nonce ? load.res : { kind: "loading" };
  const retry = () => setNonce((n) => n + 1);

  if (state.kind === "error") {
    return <DeadEnd msg="We couldn't load your account. Check your connection, then try again." onRetry={() => void reload()} />;
  }
  if (cur.kind === "error") {
    return <DeadEnd msg="We couldn't load your notifications. That doesn't mean you have none. Check your connection, then try again." onRetry={retry} />;
  }
  if (cur.kind === "loading") {
    return (
      <Screen>
        <ScreenHeader title="Notifications" />
        {showSkeleton ? <View style={{ paddingTop: t.s4, gap: t.s4 }}><SkRow /><SkRow /><SkRow /></View> : null}
      </Screen>
    );
  }

  const notes = cur.notes.map((n) => (localRead[n.id] && !n.read_at ? { ...n, read_at: localRead[n.id] } : n));
  const unread = notes.filter((n) => !n.read_at);

  const markAllRead = async () => {
    const ids = unread.map((n) => n.id);
    if (!ids.length) return;
    const now = new Date().toISOString();
    setLocalRead((p) => ({ ...p, ...Object.fromEntries(ids.map((id) => [id, now])) }));
    let failed = false;
    try { failed = !!(await supabase.from("notifications").update({ read_at: now }).in("id", ids)).error; } catch { failed = true; }
    if (failed) {
      setLocalRead((p) => { const q = { ...p }; for (const id of ids) delete q[id]; return q; });
      notify("We couldn't mark them as read. Try again.", "danger");
    }
  };

  const open = (n: Note) => {
    if (!n.read_at) {
      const now = new Date().toISOString();
      setLocalRead((p) => ({ ...p, [n.id]: now }));
      // Fire and go: a failed mark-read must never block the tap (web does the same).
      // A failed one drops its local marker, so the row reads unread again and a tap retries.
      const unmark = () => setLocalRead((p) => { const q = { ...p }; delete q[n.id]; return q; });
      void supabase.from("notifications").update({ read_at: now }).eq("id", n.id).then(({ error }) => { if (error) unmark(); }, unmark);
    }
    const d = destinationFor(n);
    if ("app" in d) router.navigate(d.app);
    else openOnWeb(d.web);
  };

  return (
    <Screen onRefresh={async () => retry()}>
      <ScreenHeader title="Notifications" />
      {unread.length > 0 ? (
        <View style={{ marginBottom: t.s3 }}>
          <Button variant="ghost" onPress={() => void markAllRead()}>Mark all read</Button>
        </View>
      ) : null}
      <Card>
        {notes.length === 0 ? (
          <Row icon="bell" tone="neutral" title="You're all caught up." sub="New updates about your requests show up here." />
        ) : notes.map((n) => (
          <Row key={n.id} icon="bell" tone={n.read_at ? "neutral" : "accent"}
            title={n.title ?? "Update"}
            sub={(n.body ? n.body + "\n" : "") + timeAgo(n.created_at)}
            chevron onPress={() => open(n)}
            accessibilityLabel={`${n.read_at ? "" : "Unread. "}${n.title ?? "Update"}. ${timeAgo(n.created_at)}`} />
        ))}
      </Card>
    </Screen>
  );
}
