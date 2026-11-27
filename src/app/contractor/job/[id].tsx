// One of the contractor's own jobs (PLAN step 5.7). `focus` is the section an
// attention row named (rules.ts anchors): the screen scrolls to it and rings it.
import React from "react";
import { useLocalSearchParams } from "expo-router";
import { ContractorJobScreen } from "@/features/contractor/job/JobScreen";

export default function ContractorJobRoute() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  return <ContractorJobScreen id={String(id ?? "")} focus={focus ? String(focus) : undefined} />;
}
