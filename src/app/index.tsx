// Phase 1–2 placeholder: shows the kit (KitLab, the native /ui-lab) in dev builds.
// Phase 3 step 3.1 replaces this with the auth gate (PLAN.md §4.2).
import React from "react";
import { KitLab } from "@/features/dev/KitLab";
import { DeadEnd } from "@/kit";

export default function Index() {
  if (__DEV__) return <KitLab />;
  return <DeadEnd retry={false} msg="This build isn't ready yet." alt="Use freddyfixit.ca for now." />;
}
