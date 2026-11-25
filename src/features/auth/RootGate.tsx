// The root gate (PLAN.md §4.2). Every launch and every cold deep link starts here.
//   readAuthUser: unknown → DeadEnd + Retry (NEVER redirect on unknown)
//                 signedOut → /welcome
//                 user → continueAfterSignIn: two-step code if the server says one is owed,
//                        then resolveDestination → role home / chooser / problem
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { Button, DeadEnd, useTheme } from "@/kit";
import { readAuthUser } from "@/lib/authRead";
import { continueAfterSignIn, forgetSignIn, signOut } from "@/features/auth/flow";

export function RootGate() {
  const { t } = useTheme();
  const [unknown, setUnknown] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    (async (): Promise<boolean> => { // true = we couldn't tell (show Retry)
      const a = await readAuthUser();
      if (a.kind === "unknown") return true;
      if (a.kind === "signedOut") { await forgetSignIn(); router.replace("/welcome"); return false; }
      // PLAN §4.2 step 2: every launch asks the SERVER whether a two-step code is owed
      // (mfaOwed; it fails open on a read error, like web). continueAfterSignIn does that,
      // resumes any unfinished sign-in's intent, then resolves the destination.
      await continueAfterSignIn();
      return false;
    })().catch(() => true).then((u) => { if (alive) setUnknown(u); });
    return () => { alive = false; };
  }, [attempt]);

  if (unknown) {
    return <DeadEnd msg="We couldn't reach Freddy Fix It just now. Check your connection, then try again."
      onRetry={() => { setUnknown(false); setAttempt((n) => n + 1); }}
      alt={<Button variant="ghost" onPress={() => void signOut()}>Sign out</Button>} />;
  }
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }} accessibilityLabel="Loading">
      <ActivityIndicator color={t.text} />
    </View>
  );
}
