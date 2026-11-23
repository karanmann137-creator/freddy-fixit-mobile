// TEMPORARY home for each role, until Phase 4 (client tabs) and Phase 5 (contractor
// tabs) replace it. It proves the sign-in pipeline landed in the right place, and
// gives a way out (sign out). Dev builds also link to the kit lab.
import React, { useEffect, useState } from "react";
import { router } from "expo-router";
import { Button, Card, Pass, PassTop, Hero, HeroSub, Row, Screen, Stack, Txt, rgba, useTheme } from "@/kit";
import { readAuthUser } from "@/lib/authRead";
import { signOut } from "./flow";

export function PlaceholderHome({ who, next }: { who: string; next: string }) {
  const { t } = useTheme();
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { readAuthUser().then((a) => setEmail(a.kind === "user" ? a.email : null)); }, []);
  return (
    <Screen edges={["left", "right"]} contentStyle={{ paddingHorizontal: 0 }}>
      <Pass>
        <PassTop />
        <Hero>{`You're signed in as a ${who}`}</Hero>
        <HeroSub>{email ?? ""}</HeroSub>
      </Pass>
      <Card style={{ margin: t.s4 }}>
        <Row icon="info" tone="neutral" title="Your dashboard is on its way" sub={next} />
        {__DEV__ ? <Row icon="layers" tone="neutral" title="Kit lab (dev build only)" chevron onPress={() => router.push("/dev/kit")} /> : null}
      </Card>
      <Txt size={0.82} color={rgba(t.muted, 0.7)} style={{ marginHorizontal: t.s4 }}>Until then, freddyfixit.ca has everything.</Txt>
      <Stack>
        <Button variant="ghost" full onPress={() => void signOut()} style={{ marginHorizontal: t.s4 }}>Sign out</Button>
      </Stack>
    </Screen>
  );
}
