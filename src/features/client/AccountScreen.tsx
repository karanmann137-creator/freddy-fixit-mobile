// STUB: replaced by step 4.17.
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
