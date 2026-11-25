// Root layout: fonts + saved prefs load behind the splash, then the theme.
// The auth gate is src/app/index.tsx. ConfirmHost/ToastHost are mounted below,
// once, so no screen can forget to mount them.
import "@/platform/polyfills"; // FIRST: synced web code needs crypto.subtle.digest
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
import { ConfirmHost, ThemeProvider, ToastHost, useTheme } from "@/kit";
import { initPrefs } from "@/lib/theme";
import { TermsHost } from "@/features/legal/TermsHost";
import { CompletionThanksHost } from "@/features/client/CompletionThanksHost";

SplashScreen.preventAutoHideAsync().catch(() => {});

function Shell() {
  const { t, scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
      {/* Mounted once, here, so no screen can forget them (web: a missing ConfirmDialog hung the button forever). */}
      <ConfirmHost />
      <ToastHost />
      {/* Without it ensureTermsAccepted() fails open: changed terms would never be shown. */}
      <TermsHost />
      {/* Without it the job-done review/referral ask stamps its cooldown and shows nothing. */}
      <CompletionThanksHost />
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
