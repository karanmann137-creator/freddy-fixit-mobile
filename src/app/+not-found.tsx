import React from "react";
import { router } from "expo-router";
import { DeadEnd } from "@/kit";

export default function NotFound() {
  return <DeadEnd msg="That page doesn't exist in the app." retryLabel="Go home" onRetry={() => router.replace("/")} />;
}
