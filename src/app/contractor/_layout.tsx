// Contractor area: one data provider for every tab and pushed screen.
import React from "react";
import { Stack } from "expo-router";
import { useTheme } from "@/kit";
import { ContractorDataProvider } from "@/features/contractor/data";

export default function ContractorLayout() {
  const { t } = useTheme();
  return (
    <ContractorDataProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
    </ContractorDataProvider>
  );
}
