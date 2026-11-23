import React from "react";
import { Handoff } from "@/features/client/Handoff";

// Step 4.15 (recurring plans + prepay pool) is a money step (gate G4b).
export default function ClientRecurring() {
  return <Handoff title="Recurring plans" icon="refresh" what="See and manage your recurring plans" />;
}
