// Phase 1–2 placeholder: shows the kit (KitLab, the native /ui-lab) in dev builds.
// Phase 3 step 3.1 replaces this with the auth gate (PLAN.md §4.2).
// KitLab is required inside the __DEV__ branch so it is not in a production bundle.
import React from "react";
import { DeadEnd } from "@/kit";

export default function Index() {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { KitLab } = require("@/features/dev/KitLab") as typeof import("@/features/dev/KitLab");
    return <KitLab />;
  }
  return <DeadEnd retry={false} msg="This build isn't ready yet." alt="Use freddyfixit.ca for now." />;
}
