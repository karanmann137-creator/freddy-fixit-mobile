// Computed config layered on app.json (PLAN.md §1). Only what can't be static lives here.
import type { ConfigContext, ExpoConfig } from "expo/config";

// Web paths the app opens directly (iOS universal links / Android App Links). The web
// side publishes the matching apple-app-site-association + assetlinks.json (PLAN W3c).
// Any other freddyfixit.ca link stays in the browser.
const APP_LINK_PATHS = ["/auth/confirm", "/update-password", "/pick/", "/app/return/", "/contractors/"];

export default ({ config }: ConfigContext): ExpoConfig => {
  // Google's iOS SDK needs the reversed iOS client id as a URL scheme. No id = no Google
  // plugin, and the Google button hides itself (oauth.ts googleAvailable()).
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const iosUrlScheme = iosClientId ? `com.googleusercontent.apps.${iosClientId.replace(/\.apps\.googleusercontent\.com$/, "")}` : null;

  return {
    ...config,
    name: config.name ?? "Freddy Fix It",
    slug: config.slug ?? "freddy-fixit",
    ios: {
      ...config.ios,
      usesAppleSignIn: true,
      associatedDomains: ["applinks:freddyfixit.ca"],
    },
    android: {
      ...config.android,
      intentFilters: [{
        action: "VIEW",
        autoVerify: true,
        data: APP_LINK_PATHS.map((pathPrefix) => ({ scheme: "https", host: "freddyfixit.ca", pathPrefix })),
        category: ["BROWSABLE", "DEFAULT"],
      }],
    },
    plugins: [
      ...(config.plugins ?? []),
      "expo-apple-authentication",
      ...(iosUrlScheme ? [["@react-native-google-signin/google-signin", { iosUrlScheme }] as [string, unknown]] : []),
    ],
  };
};
