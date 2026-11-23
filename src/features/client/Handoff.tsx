// A screen whose real version is a later Phase 4 step. It says so and offers the
// website, which does the same thing today: never a dead tab or a blank screen.
import React from "react";
import { Card, Row, Screen, ScreenHeader, Txt, rgba, useTheme, type IconName } from "@/kit";
import { openOnWeb } from "./web";

export function Handoff({ title, icon, what, path = "/client-dashboard", tab = false }: { title: string; icon: IconName; what: string; path?: string; tab?: boolean }) {
  const { t } = useTheme();
  return (
    <Screen>
      <ScreenHeader title={title} back={!tab} />
      <Card>
        <Row icon={icon} tone="neutral" title={what} sub="Open it on freddyfixit.ca" chevron onPress={() => openOnWeb(path)} />
      </Card>
      <Txt size={0.82} color={rgba(t.muted, 0.75)} style={{ marginTop: t.s3 }}>This comes to the app in an upcoming update.</Txt>
    </Screen>
  );
}
