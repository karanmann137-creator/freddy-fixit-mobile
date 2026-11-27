// Contractor area: one data provider for every tab and pushed screen.
import React from "react";
import { Stack } from "expo-router";
import { useTheme } from "@/kit";
import { ContractorDataProvider } from "@/features/contractor/data";
import { ContractorChatInbox } from "@/features/chat/inbox";

export default function ContractorLayout() {
  const { t } = useTheme();
  return (
    <ContractorDataProvider>
      {/* One inbox per area: the Messages tab, its tab-bar badge and every chat screen read it. */}
      <ContractorChatInbox>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
      </ContractorChatInbox>
    </ContractorDataProvider>
  );
}
