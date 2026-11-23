// The root gate (PLAN.md §4.2). Every launch and every cold deep link starts here.
//   readAuthUser: unknown → DeadEnd + Retry (NEVER redirect on unknown)
//                 signedOut → /welcome
//                 user → an unfinished sign-in? resume the pipeline (code check included)
//                        else resolveDestination → role home / chooser / problem
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { DeadEnd, useTheme } from "@/kit";
import { readAuthUser } from "@/lib/authRead";
import { resolveDestination } from "@/features/auth/destination";
import { abandonSignIn, continueAfterSignIn, go, pendingSignIn } from "@/features/auth/flow";

export default function RootGate() {
  const { t } = useTheme();
  const [unknown, setUnknown] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    (async (): Promise<boolean> => { // true = we couldn't tell (show Retry)
      const a = await readAuthUser();
      if (a.kind === "unknown") return true;
      if (a.kind === "signedOut") { await abandonSignIn(); router.replace("/welcome"); return false; }
      // A sign-in left unfinished (killed mid-code, mid-name-save, or on a Retry) resumes the
      // whole pipeline, code check included, so nothing can walk past the second factor.
      if (await pendingSignIn()) { await continueAfterSignIn(); return false; }
      go(await resolveDestination(a.userId, null));
      return false;
    })().catch(() => true).then((u) => { if (alive) setUnknown(u); });
    return () => { alive = false; };
  }, [attempt]);

  if (unknown) return <DeadEnd msg="We couldn't reach Freddy Fix It just now. Check your connection, then try again." onRetry={() => { setUnknown(false); setAttempt((n) => n + 1); }} />;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }} accessibilityLabel="Loading">
      <ActivityIndicator color={t.text} />
    </View>
  );
}
