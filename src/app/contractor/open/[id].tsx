// One open job from the Available tab (PLAN step 5.5): details, bid, hide.
// Not `contractor/job/[id]`: that path is kept for the contractor's own jobs (step 5.7).
import React from "react";
import { useLocalSearchParams } from "expo-router";
import { OpenJobScreen } from "@/features/contractor/OpenJobScreen";

export default function OpenJobRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <OpenJobScreen id={String(id ?? "")} />;
}
