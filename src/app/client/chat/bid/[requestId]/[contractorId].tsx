// BidChat for the client (PLAN step 4.11): one thread per pro who bid on the request.
import React from "react";
import { useLocalSearchParams } from "expo-router";
import { BidChatScreen } from "@/features/chat/BidChatScreen";

export default function ClientBidChatRoute() {
  const { requestId, contractorId } = useLocalSearchParams<{ requestId: string; contractorId: string }>();
  return <BidChatScreen requestId={String(requestId ?? "")} contractorId={String(contractorId ?? "")} />;
}
