// Native Google and Sign in with Apple → a Supabase session via signInWithIdToken.
// PLAN.md §4.3. No browser round-trip, so no redirect URL and no PKCE verifier.
//
// Owner setup this depends on (PLAN.md §7 A1), without which the buttons hide or fail:
//   Google: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (the web OAuth client Supabase already
//     uses) + EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID; both client ids listed in Supabase →
//     Auth → Google → "Authorized Client IDs"; "Skip nonce check" ON (the iOS Google
//     SDK adds a nonce Supabase can't see).
//   Apple: Supabase → Auth → Apple enabled with client id ca.freddyfixit.app.
import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from "@react-native-google-signin/google-signin";
import { supabase } from "@/lib/supabase";

export type OAuthResult = { ok: true; firstName?: string | null; lastName?: string | null } | { ok: false; cancelled: true } | { ok: false; cancelled?: false; message: string };

const WEB_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
let configured = false;

export function googleAvailable(): boolean {
  return !!WEB_ID && (Platform.OS !== "ios" || !!IOS_ID);
}

/**
 * @param forceChooser true on the SIGN-IN surface: sign the Google SDK out first so
 *   the account chooser always shows. Web 2026-11-09: the owner was silently signed
 *   into his client account. The signup funnels pass false, the same asymmetry as web.
 */
export async function signInWithGoogle(forceChooser: boolean): Promise<OAuthResult> {
  if (!googleAvailable()) return { ok: false, message: "Google sign-in isn't set up in this build yet. Use your email and password." };
  try {
    if (!configured) { GoogleSignin.configure({ webClientId: WEB_ID, iosClientId: IOS_ID }); configured = true; }
    if (Platform.OS === "android") await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    if (forceChooser) await GoogleSignin.signOut().catch(() => {});
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) return { ok: false, cancelled: true };
    const token = res.data.idToken;
    if (!token) return { ok: false, message: "Google didn't return a sign-in token. Try again." };
    const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token });
    if (error) return { ok: false, message: "We couldn't finish signing you in with Google. Try again, or use your email and password." };
    return { ok: true };
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS) return { ok: false, cancelled: true };
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { ok: false, message: "Google Play services aren't available on this phone. Use your email and password." };
    }
    return { ok: false, message: "Google sign-in didn't work just now. Try again." };
  }
}

export async function appleAvailable(): Promise<boolean> {
  return Platform.OS === "ios" && (await AppleAuthentication.isAvailableAsync().catch(() => false));
}

export async function signInWithApple(): Promise<OAuthResult> {
  try {
    // Apple gets the SHA-256 of a one-time nonce; Supabase gets the raw value and checks they match.
    const raw = Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, "0")).join("");
    const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
    if (!cred.identityToken) return { ok: false, message: "Apple didn't return a sign-in token. Try again." };
    const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: cred.identityToken, nonce: raw });
    if (error) return { ok: false, message: "We couldn't finish signing you in with Apple. Try again, or use your email and password." };
    // Apple sends the name ONLY on the very first sign-in. Keep it now or never.
    return { ok: true, firstName: cred.fullName?.givenName ?? null, lastName: cred.fullName?.familyName ?? null };
  } catch (e) {
    if ((e as { code?: string })?.code === "ERR_REQUEST_CANCELED") return { ok: false, cancelled: true };
    return { ok: false, message: "Sign in with Apple didn't work just now. Try again." };
  }
}
