// JobChat for the client (PLAN step 4.10). Route stays thin: params → the shared screen.
import React from "react";
import { useLocalSearchParams } from "expo-router";
import { JobChatScreen } from "@/features/chat/JobChatScreen";

export default function ClientJobChatRoute() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  return <JobChatScreen jobId={String(jobId ?? "")} />;
}
