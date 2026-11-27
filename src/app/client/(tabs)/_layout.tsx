// Client tabs (PLAN step 4.1): Requests / Messages / Pros / Account.
// Which tabs show is clientNav() (port of web visibleNav): Pros from the first pro,
// and also when the pros read failed, so its couldn't-load row is reachable.
// The active tab is the text colour, never orange (orange means "it's on you").
import React from "react";
import { Tabs } from "expo-router";
import { fonts, Ic, rgba, useTheme, type IconName } from "@/kit";
import { unreadBadge, useChatInbox } from "@/features/chat/inbox";
import { useClientData } from "@/features/client/data";
import { clientNav, isPastRequest } from "@/features/client/rules";

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: unknown; size: number }) {
    return <Ic name={name} size={size} color={typeof color === "string" ? color : undefined} />;
  };
}

export default function ClientTabs() {
  const { t } = useTheme();
  // Both halves of the inbox (job + pre-hire threads), the same array the Messages tab lists.
  const { totalUnread } = useChatInbox();
  const { state } = useClientData();
  const d = state.kind === "ok" ? state.data : null;
  const nav = clientNav({ pros: d?.pros.length ?? 0, plans: d?.plans.length ?? 0, past: d?.requests.filter(isPastRequest).length ?? 0 });
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.text,
        tabBarInactiveTintColor: rgba(t.muted, 0.8),
        tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.hair, borderTopWidth: t.hairW },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Requests", tabBarIcon: tabIcon("clipboard-list") }} />
      <Tabs.Screen name="messages" options={{ title: "Messages", tabBarIcon: tabIcon("message-square"),
        tabBarBadge: unreadBadge(totalUnread), tabBarBadgeStyle: { backgroundColor: t.accent500, color: "#fff" /* rule-ok: web badge text is white */, fontFamily: fonts.bodyBold } }} />
      <Tabs.Screen name="pros" options={{ title: "My Pros", tabBarIcon: tabIcon("user-check"), href: nav.pros || d?.prosFailed ? undefined : null }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: tabIcon("user") }} />
    </Tabs>
  );
}
