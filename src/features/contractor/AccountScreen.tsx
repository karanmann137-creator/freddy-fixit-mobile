// STUB: replaced by step 5.4 (profile tab).
import React from "react";
import { Button, Screen, ScreenHeader } from "@/kit";
import { signOut } from "@/features/auth/flow";

export function AccountScreen() {
  return (
    <Screen>
      <ScreenHeader title="Account" back={false} />
      <Button variant="ghost" full onPress={() => void signOut()}>Sign out</Button>
    </Screen>
  );
}
