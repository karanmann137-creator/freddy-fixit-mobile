// Contractor tabs (PLAN step 5.1): Jobs / Available / Messages / Earnings / Account.
// Earnings appears once something is earned (web visibleNav). Active tab is the
// text colour, never orange.
import React from "react";
import { Tabs } from "expo-router";
import { fonts, Ic, rgba, useTheme, type IconName } from "@/kit";
import { unreadBadge, useChatInbox } from "@/features/chat/inbox";
import { useContractorData } from "@/features/contractor/data";
import { contractorNav, navCounts } from "@/features/contractor/rules";

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: unknown; size: number }) {
    return <Ic name={name} size={size} color={typeof color === "string" ? color : undefined} />;
  };
}

export default function ContractorTabs() {
  const { t } = useTheme();
  // Both halves of the inbox (job + pre-hire threads), the same array the Messages tab lists.
  const { totalUnread } = useChatInbox();
  const { state } = useContractorData();
  const nav = state.kind === "ok" ? contractorNav(navCounts(state.data)) : { earnings: false };
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
      <Tabs.Screen name="index" options={{ title: "Jobs", tabBarIcon: tabIcon("briefcase") }} />
      <Tabs.Screen name="available" options={{ title: "Available", tabBarIcon: tabIcon("search") }} />
      <Tabs.Screen name="messages" options={{ title: "Messages", tabBarIcon: tabIcon("message-square"),
        tabBarBadge: unreadBadge(totalUnread), tabBarBadgeStyle: { backgroundColor: t.accent500, color: "#fff" /* rule-ok: web badge text is white */, fontFamily: fonts.bodyBold } }} />
      <Tabs.Screen name="earnings" options={{ title: "Earnings", tabBarIcon: tabIcon("dollar"), href: nav.earnings ? undefined : null }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: tabIcon("user") }} />
    </Tabs>
  );
}
