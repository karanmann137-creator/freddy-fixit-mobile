// The root gate (PLAN.md §4.2). Every launch and every cold deep link starts here.
//   readAuthUser: unknown → DeadEnd + Retry (NEVER redirect on unknown)
//                 signedOut → /welcome
//                 user → two-step code still owed from a killed sign-in? → /verify-code
//                        else resolveDestination → role home / chooser / problem
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { DeadEnd, useTheme } from "@/kit";
import { readAuthUser } from "@/lib/authRead";
import { resolveDestination } from "@/features/auth/destination";
import { go, mfaPendingFromLastRun } from "@/features/auth/flow";

export default function RootGate() {
  const { t } = useTheme();
  const [unknown, setUnknown] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    (async (): Promise<boolean> => { // true = we couldn't tell (show Retry)
      const a = await readAuthUser();
      if (a.kind === "unknown") return true;
      if (a.kind === "signedOut") { router.replace("/welcome"); return false; }
      if (await mfaPendingFromLastRun()) { router.replace("/verify-code"); return false; }
      go(await resolveDestination(a.userId, null));
      return false;
    })().then((u) => { if (alive) setUnknown(u); });
    return () => { alive = false; };
  }, [attempt]);

  if (unknown) return <DeadEnd msg="We couldn't reach Freddy Fix It just now. Check your connection, then try again." onRetry={() => { setUnknown(false); setAttempt((n) => n + 1); }} />;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }} accessibilityLabel="Loading">
      <ActivityIndicator color={t.text} />
    </View>
  );
}
