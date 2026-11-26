// Client area: one data provider for every tab and every pushed screen, so the tab
// bar's counts and the Requests tab read the same arrays (features/client/data.tsx).
import React from "react";
import { Stack } from "expo-router";
import { useTheme } from "@/kit";
import { ClientDataProvider } from "@/features/client/data";
import { ClientChatInbox } from "@/features/chat/inbox";

export default function ClientLayout() {
  const { t } = useTheme();
  return (
    <ClientDataProvider>
      {/* One inbox per area: the Messages tab, its tab-bar badge and every chat screen read it. */}
      <ClientChatInbox>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
      </ClientChatInbox>
    </ClientDataProvider>
  );
}
