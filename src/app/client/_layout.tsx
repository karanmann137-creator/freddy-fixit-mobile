// Client area: one data provider for every tab and every pushed screen, so the tab
// bar's counts and the Requests tab read the same arrays (features/client/data.tsx).
import React from "react";
import { Stack } from "expo-router";
import { useTheme } from "@/kit";
import { ClientDataProvider } from "@/features/client/data";

export default function ClientLayout() {
  const { t } = useTheme();
  return (
    <ClientDataProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
    </ClientDataProvider>
  );
}
