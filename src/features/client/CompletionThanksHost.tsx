// Port of web components/CompletionThanksModal.tsx: ONE sheet, TWO asks, review first.
// Mounted once in the root layout (check-rules): without it requestCompletionThanks
// stamps the cooldown and shows nothing, so the person is never asked again.
// Display only: the review opens the Google page in the in-app browser, the referral
// goes through the native share sheet (as ReferralCard does). No money is shown.
// "Don't ask again" opts out of exactly the halves that were SHOWN.
import React, { useEffect, useState } from "react";
import { Share, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { BottomSheet, Button, Txt, notify, rgba, useTheme } from "@/kit";
import { on } from "@/lib/bus";
import { COMPLETION_THANKS_EVENT, type CompletionThanks } from "@/lib/completionPrompt";
import { GOOGLE_REVIEW_URL, reviewOptOut } from "@/lib/reviewPrompt";
import { referralPromptOptOut } from "@/lib/referralPrompt";

export function CompletionThanksHost() {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    return on(COMPLETION_THANKS_EVENT, (detail: unknown) => {
      const d = detail as CompletionThanks | undefined;
      if (!d || (!d.review && !d.code)) return;
      setReview(!!d.review); setCode(d.code ?? null); setOpen(true);
    });
  }, []);

  const close = () => setOpen(false);
  const never = () => {
    if (review) void reviewOptOut();
    if (code) void referralPromptOptOut();
    close();
  };
  const goReview = async () => {
    try {
      await WebBrowser.openBrowserAsync(GOOGLE_REVIEW_URL);
    } catch {
      // The action stays on screen so "try again" has something to try (CodeRabbit #8).
      notify("Couldn't open the link. Check your connection and try again.", "danger");
      return;
    }
    // Not closed unless it was the only ask: the referral half stays on screen.
    setReview(false);
    if (!code) close();
  };
  const share = async () => {
    if (!code) return;
    try {
      await Share.share({ message: "Get your first Freddy Fix It service fee waived with my code " + code + ": https://freddyfixit.ca/?ref=" + code });
    } catch { notify("Couldn't open sharing. Your code is " + code + ".", "danger"); }
  };

  const body = review && code ? "Rate us on Google and give your friends a discount."
    : review ? "A 30-second Google review helps other Calgary homeowners hire with confidence."
    : "Give your friends a discount: their first job's service fee is on us.";

  return (
    <BottomSheet open={open} onClose={close} label="Thanks">
      <View style={{ gap: t.s3, alignItems: "stretch" }}>
        <Txt variant="display" size={1.4} accessibilityRole="header" style={{ textAlign: "center" }}>Loved the service?</Txt>
        <Txt size={0.92} lh={1.5} color={rgba(t.muted, 0.9)} style={{ textAlign: "center" }}>{body}</Txt>
        {review ? <Button full onPress={goReview}>Leave a Google review</Button> : null}
        {code ? (
          <View style={{ gap: t.s3, paddingTop: review ? t.s3 : 0, borderTopWidth: review ? t.hairW : 0, borderTopColor: t.hair }}>
            <Txt size={0.85} lh={1.5} color={rgba(t.muted, 0.9)} style={{ textAlign: "center" }}>
              {"Your code waives the service fee on a friend's first job. It's good for one friend."}
            </Txt>
            <Txt selectable variant="label" size={1.5} ls={0.12} color={t.text} style={{ textAlign: "center" }}>{code}</Txt>
            <Button full onPress={() => void share()}>Share invite link</Button>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: t.s3, marginTop: t.s2 }}>
          <View style={{ flex: 1 }}><Button variant="ghost" full onPress={close}>Maybe later</Button></View>
          <View style={{ flex: 1 }}><Button variant="ghost" full onPress={never}>{"Don't ask again"}</Button></View>
        </View>
      </View>
    </BottomSheet>
  );
}
