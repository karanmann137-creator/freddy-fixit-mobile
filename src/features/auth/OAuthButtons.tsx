// "Continue with Google / Apple". Hidden when this build or phone can't do them
// (Apple: iOS only; Google: only when the client ids are configured).
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { Button, FormNote, Ic, Txt, useTheme } from "@/kit";
import { appleAvailable, googleAvailable, signInWithApple, signInWithGoogle } from "./oauth";
import { abandonSignIn, beginSignIn, continueAfterSignIn, rememberFirstSignInName } from "./flow";
import type { WantedRole } from "./destination";

export function OAuthButtons({ wantedRole = null, signInSurface }: { wantedRole?: WantedRole; signInSurface: boolean }) {
  const { t, scheme } = useTheme();
  const [apple, setApple] = useState(false);
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { appleAvailable().then(setApple); }, []);
  const google = googleAvailable();
  if (!google && !apple) return null;

  const run = async (which: "google" | "apple") => {
    setErr(""); setBusy(which);
    await beginSignIn(wantedRole); // before the provider call: a kill after this resumes the pipeline
    const r = which === "google" ? await signInWithGoogle(signInSurface) : await signInWithApple();
    if (!r.ok) {
      await abandonSignIn();
      setBusy(null);
      if (!("cancelled" in r && r.cancelled)) setErr((r as { message: string }).message);
      return;
    }
    if (which === "apple") await rememberFirstSignInName(r.firstName, r.lastName); // saved once the profile row is certain
    try { await continueAfterSignIn(); } catch { setBusy(null); setErr("Something went wrong finishing your sign-in. Try again."); } // success navigates away
  };

  return (
    <View style={{ gap: t.s3, marginTop: t.s5 }}>
      {apple && (
        // Apple's own button: required styling under App Store guideline 4.8 / HIG.
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={scheme === "dark" ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={t.r3}
          style={{ height: t.hCtl, width: "100%", opacity: busy ? 0.6 : 1 }}
          onPress={() => { if (!busy) void run("apple"); }}
        />
      )}
      {google && (
        <Button full loading={busy === "google"} disabled={!!busy} onPress={() => run("google")} accessibilityLabel="Continue with Google">
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.s2 }}>
            <Ic name="user" color={t.text} />
            <Txt variant="label">Continue with Google</Txt>
          </View>
        </Button>
      )}
      {err ? <FormNote>{err}</FormNote> : null}
    </View>
  );
}

