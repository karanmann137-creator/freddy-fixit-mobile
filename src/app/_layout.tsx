// Root layout: fonts + saved prefs load behind the splash, then the theme.
// Phase 3 (PLAN.md §4.2) adds the auth gate here; ConfirmDialog/Toast are mounted
// here once (step 2.10) so no screen can forget to mount them.
import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue/400Regular";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { Archivo_700Bold } from "@expo-google-fonts/archivo/700Bold";
import { ThemeProvider, useTheme } from "@/kit";
import { initPrefs } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

function Shell() {
  const { t, scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ BebasNeue_400Regular, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold, Archivo_700Bold });
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  useEffect(() => { initPrefs().finally(() => setPrefsLoaded(true)); }, []);
  // A font that fails to load falls back to the system face; it must never hold the app on the splash.
  const ready = (fontsLoaded || !!fontError) && prefsLoaded;
  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);
  if (!ready) return null; // splash is still showing

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
