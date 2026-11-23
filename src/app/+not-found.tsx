// A link the app doesn't handle (e.g. a freddyfixit.ca page that only exists on the
// web) is offered on the web instead of dead-ending.
import React from "react";
import { View } from "react-native";
import { router, usePathname } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Button, DeadEnd, useTheme } from "@/kit";

export default function NotFound() {
  const { t } = useTheme();
  const path = usePathname();
  return (
    <DeadEnd retry={false} msg="That page isn't in the app." alt={
      <View style={{ gap: t.s3, alignItems: "center" }}>
        <Button variant="primary" onPress={() => WebBrowser.openBrowserAsync(`https://freddyfixit.ca${path || "/"}`)}>Open it on the website</Button>
        <Button variant="ghost" onPress={() => router.replace("/")}>Go home</Button>
      </View>
    } />
  );
}
