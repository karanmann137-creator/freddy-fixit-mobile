// Dev-only kit lab. Required inside __DEV__ so it never ships in a production bundle.
import React from "react";
import { DeadEnd } from "@/kit";
import { router } from "expo-router";

export default function KitRoute() {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { KitLab } = require("@/features/dev/KitLab") as typeof import("@/features/dev/KitLab");
    return <KitLab />;
  }
  return <DeadEnd msg="Not available." retryLabel="Go home" onRetry={() => router.replace("/")} />;
}
