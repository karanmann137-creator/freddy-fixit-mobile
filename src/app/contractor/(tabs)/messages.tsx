import React from "react";
import { Handoff } from "@/features/client/Handoff";

// Messages (shared with 4.10–4.12) need the web's W2 change (bus.ts) first: PLAN §2.3.
export default function ContractorMessages() {
  return <Handoff tab title="Messages" icon="message-square" what="Read and reply to your clients" path="/contractor-dashboard" />;
}
