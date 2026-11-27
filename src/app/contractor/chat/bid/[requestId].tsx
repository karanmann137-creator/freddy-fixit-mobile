// BidChat for the contractor (PLAN step 4.11): the thread is always the contractor's own.
import React from "react";
import { useLocalSearchParams } from "expo-router";
import { BidChatScreen } from "@/features/chat/BidChatScreen";

export default function ContractorBidChatRoute() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  return <BidChatScreen requestId={String(requestId ?? "")} />;
}
