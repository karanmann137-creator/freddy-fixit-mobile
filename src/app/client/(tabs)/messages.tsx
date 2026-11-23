import React from "react";
import { Handoff } from "@/features/client/Handoff";

// Step 4.12 (Messages inbox) needs the web's W2 change (bus.ts) first: PLAN §2.3.
export default function ClientMessages() {
  return <Handoff tab title="Messages" icon="message-square" what="Read and reply to your pros" />;
}
