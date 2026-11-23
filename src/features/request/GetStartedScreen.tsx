// Client signup funnel (PLAN step 4.4): port of the signed-OUT branch of web
// pages/ClientOnboarding.tsx. It creates the account AND the first request together:
// the request travels as signUp() metadata and the DB trigger handle_new_user()
// writes the client_requests row(s), even when email confirmation means there is
// no session yet. The form pieces are the 4.3 ones (features/request/pieces).
//
// Path: describe (+email +postal) → [confirm, only when detection came up short]
//       → photo → details → account. Step ids are STABLE, not positions (web).
//
// Auth goes through the app's one pipeline (features/auth/flow.ts):
//   beginSignIn("client") BEFORE signUp → abandonSignIn on any failure or when no
//   session exists → continueAfterSignIn when they open the app. So the two-step
//   code and the role rules apply (an existing contractor/admin is never demoted:
//   resolveDestination), and a kill after the session exists resumes on relaunch.
//
// Legal record (terms.ts): the tick is STASHED right after signUp, then redeemed
// at once when a session exists, or by the pipeline after the email link. Referral:
// a typed code is stashed too (it must survive the email detour), applied now if
// there's a session, else by the pipeline. Both exactly as web.
//
// Not here, deliberately: Google/Apple on the account step. On web that path drops
// the typed request (nothing reads the signup draft after OAuth); see the report.
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { Button, DeadEnd, Field, FormNote, Ic, Screen, ScreenHeader, Stack, Txt, rgba, ui, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { readAuthUser } from "@/lib/authRead";
import { redeemStashedTermsConsent, stashTermsConsent } from "@/lib/terms";
import { applyReferralAtSignup, stashReferralCode, stashedReferralCode } from "@/lib/referralCode";
import { trackEvent } from "@/lib/analytics";
import { detectJobSplit, type SplitPart } from "@/lib/jobSplit";
import { floorFor } from "@/lib/servicePricing";
import { formatApproxLocation, isPostalCode, normalizePostal } from "@/lib/calgaryAreas";
import { acceptingRequests, usePlatformStatus } from "@/lib/platformStatus";
import { fmtPhone, validateEmail, validatePhone } from "@/lib/emailValidation";
import { ONBOARDING_DRAFT_KEY, clearDraft, dBool, dNum, dStr, useDraftAutosave, useStoredDraft } from "@/lib/requestDraft";
import type { UploadAsset } from "@/lib/imageCompress";
import { uploadImage } from "@/platform/upload";
import { PasswordField } from "@/features/auth/PasswordField";
import { abandonSignIn, beginSignIn, continueAfterSignIn } from "@/features/auth/flow";
import { WEB } from "@/features/client/web";
import { useRequestCore } from "./useRequestCore";
import { namesFromEmail, serviceFromParam } from "./webPage";
import {
  BudgetNote, ChoiceRow, DraftBanner, ErrorText, FormCard, FormNav, Label, LocationBlock, NextSteps, Note, PhotoNudge,
  PhotoPicker, QuestionsBlock, ScheduleBlock, ServiceConfirm, SplitSheet, StepProgress, StepTitle, TermsTick, Tick, recurringDateError,
} from "./pieces";
import { WaitlistCard } from "./Waitlist";

// Stable ids (web): S_PHOTO is 5 although it shows second; order lives in the paths.
const S_DESCRIBE = 1, S_CONFIRM = 2, S_DETAILS = 3, S_ACCOUNT = 4, S_PHOTO = 5;
const FULL_PATH = [S_DESCRIBE, S_CONFIRM, S_PHOTO, S_DETAILS, S_ACCOUNT];
const SHORT_PATH = [S_DESCRIBE, S_PHOTO, S_DETAILS, S_ACCOUNT];
const STEP_TITLES = ["Describe your problem", "Confirm what we found", "A few quick details", "Create your free account", "Add a photo"]; // by id
const STEP_NAMES = ["describe", "confirm", "details", "account", "photo"]; // analytics names: do not rename (web)
const MAX_STEP_ID = Math.max(...FULL_PATH);
const draftStep = (d: Record<string, unknown> | null) => dNum(d, "step", S_DESCRIBE, S_DESCRIBE, MAX_STEP_ID);
const DUPLICATE = "An account with this email already exists. Please sign in instead.";

export function GetStartedScreen() {
  const { t } = useTheme();
  const params = useLocalSearchParams<{ ref?: string; service?: string }>();
  const stored = useStoredDraft(ONBOARDING_DRAFT_KEY);
  // web's third outcome ("stalled") is a real mode: a signed-in person whose network
  // blipped must not land in a form that then refuses their own email.
  const [mode, setMode] = useState<"loading" | "signup" | "stalled">("loading");
  const [attempt, setAttempt] = useState(0);
  const [stashedRef, setStashedRef] = useState<string | null>(null);
  const [gen, setGen] = useState(0);

  useEffect(() => {
    let alive = true;
    void readAuthUser().then((who) => {
      if (!alive) return;
      if (who.kind === "user") { router.replace("/"); return; } // signed in: the gate takes them home (web renders NewRequest)
      setMode(who.kind === "signedOut" ? "signup" : "stalled");
    });
    return () => { alive = false; };
  }, [attempt]);
  useEffect(() => { void stashedReferralCode().then(setStashedRef); }, []);

  if (mode === "stalled") {
    return <DeadEnd msg="We couldn't check whether you're signed in. Nothing is wrong with your account — check your connection, then try again."
      onRetry={() => { setMode("loading"); setAttempt((n) => n + 1); }}
      alt={<Button variant="ghost" onPress={() => router.replace("/welcome")}>Back</Button>} />;
  }
  if (mode === "loading" || !stored.ready || stashedRef === null) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }} accessibilityLabel="Loading"><ActivityIndicator color={t.text} /></View>;
  }
  // A code from an invite link wins over a stale draft value of "" (web stashedRefCode reads the URL first).
  const refParam = typeof params.ref === "string" ? params.ref.trim().toUpperCase() : "";
  return (
    <SignupForm key={gen} draft={gen ? null : stored.draft} restored={gen === 0 && stored.restored}
      onStartOver={() => { stored.startOver(); setGen((g) => g + 1); }}
      initialRef={refParam || stashedRef}
      serviceParam={gen ? null : (typeof params.service === "string" ? params.service : null)} />
  );
}

function SignupForm({ draft, restored, onStartOver, initialRef, serviceParam }: {
  draft: Record<string, unknown> | null; restored: boolean; onStartOver: () => void; initialRef: string; serviceParam: string | null;
}) {
  const { t } = useTheme();
  const { status: platform, ready: platformReady } = usePlatformStatus();
  const core = useRequestCore(draft, { description: "jobDescription", schedule: "preferredSchedule" }, { addService: serviceFromParam(serviceParam) });

  const [step, setStep] = useState(() => draftStep(draft));
  // Was the confirm screen on this run's path? Recorded, not recomputed (web).
  const [confirmShown, setConfirmShown] = useState(() => dBool(draft, "confirmShown") || draftStep(draft) === S_CONFIRM);
  const visiblePath = confirmShown ? FULL_PATH : SHORT_PATH;
  // The password is never restored: it is never stored (requestDraft).
  const [form, setForm] = useState(() => ({
    email: dStr(draft, "email"),
    phone: dStr(draft, "phone"),
    password: "",
    businessName: dStr(draft, "businessName"),
    businessType: dStr(draft, "businessType"),
    locations: dStr(draft, "locations"),
    billingPreference: dStr(draft, "billingPreference"),
    referralCode: dStr(draft, "referralCode") || initialRef,
  }));
  const [clientType, setClientType] = useState<"individual" | "business">(() => (dStr(draft, "clientType") === "business" ? "business" : "individual"));
  const [pwBreached, setPwBreached] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [splitSuggestion, setSplitSuggestion] = useState<SplitPart[] | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);   // consent: never restored
  const [newsletterOptIn, setNewsletterOptIn] = useState(false); // CASL: never pre-ticked, never restored
  const [success, setSuccess] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState(false);
  const [photo, setPhoto] = useState<UploadAsset | null>(null);
  const [photoWarn, setPhotoWarn] = useState(false);
  const [photoReject, setPhotoReject] = useState("");
  const [nudged, setNudged] = useState(false);
  const [referral, setReferral] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");

  const set = (key: keyof typeof form, val: string) => { setForm((f) => ({ ...f, [key]: val })); setErrors((e) => ({ ...e, [key]: "" })); };
  const clearErr = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));

  useDraftAutosave(ONBOARDING_DRAFT_KEY, {
    step, confirmShown, ...core.snapshot(),
    email: form.email, phone: form.phone, businessName: form.businessName, businessType: form.businessType,
    locations: form.locations, billingPreference: form.billingPreference, referralCode: form.referralCode, clientType,
  }, !loading && !success && !verifyEmail);

  useEffect(() => { trackEvent("onboarding_step_view", { flow: "client", step, step_name: STEP_NAMES[step - 1] || String(step) }); }, [step]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (step === S_DESCRIBE) {
      if (core.description.trim().length < 10) errs.jobDescription = "Tell us a little more — at least 10 characters";
      { const ev = validateEmail(form.email); if (!ev.ok) errs.email = ev.error!; }
      if (!core.postalCode.trim()) errs.location = "Enter your postal code";
      else if (!isPostalCode(core.postalCode)) errs.location = "Enter a valid postal code (e.g. T2P 1J9)";
      else if (!core.area.trim()) errs.location = "Pick the area you're in";
    }
    if (step === S_CONFIRM) {
      if (core.selectedServices.length === 0) errs.serviceNeeded = "Please select at least one service";
    }
    if (step === S_DETAILS) {
      if (!core.schedule) errs.preferredSchedule = "Please select a schedule";
      const dErr = recurringDateError(core);
      if (dErr) errs.preferredSchedule = dErr;
    }
    if (step === S_ACCOUNT) {
      // Checked again here, stricter never looser: the field stays editable to the end (web).
      { const ev = validateEmail(form.email); if (!ev.ok) errs.email = ev.error!; }
      { const pv = validatePhone(form.phone, true); if (!pv.ok) errs.phone = pv.error!; }
      if (form.password.length < 8) errs.password = "Minimum 8 characters";
      else if (pwBreached) errs.password = "This password has appeared in public data breaches. Please choose a different one.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => {
    if (!validate()) return;
    if (step === S_PHOTO && !photo && !nudged) { setNudged(true); return; } // a nudge, NOT a gate, keyed to the photo screen
    if (step === S_DESCRIBE) {
      // The confirm screen is CONDITIONAL; decided here from detect()'s RETURN value (web).
      const d = core.runDetect();
      const needConfirm = d.services.length === 0 || d.tags.length === 0;
      setConfirmShown(needConfirm);
      setStep(needConfirm ? S_CONFIRM : S_PHOTO);
      return;
    }
    const i = visiblePath.indexOf(step);
    setStep(visiblePath[Math.min(visiblePath.length - 1, i + 1)]);
  };
  const back = () => {
    const i = visiblePath.indexOf(step);
    if (i <= 0) { if (router.canGoBack()) router.back(); else router.replace("/welcome"); return; }
    setStep(visiblePath[i - 1]);
  };

  /** `split`: undefined = first press · "one" = keep as one job · parts = accepted split (web). */
  const handleSubmit = async (split?: SplitPart[] | "one") => {
    if (loading) return;
    if (!validate()) return;
    if (!agreedToTerms) { setSubmitError("Please agree to the User Agreement and Privacy Policy to continue."); return; }
    setLoading(true); setSubmitError(""); setSplitSuggestion(null);
    const derivedName = namesFromEmail(form.email);
    let begun = false;
    try {
      // Asked BEFORE signUp: the dialog re-enters here, and creating the auth user twice is not idempotent.
      if (split === undefined) {
        const suggestion = await detectJobSplit(core.description);
        if (suggestion && suggestion.length >= 2) { setSplitSuggestion(suggestion); setLoading(false); return; }
      }
      const splitParts = Array.isArray(split) ? split : null;
      // The whole request as signup metadata: handle_new_user() writes it even with no session.
      const metadata: Record<string, unknown> = {
        role: "client",
        first_name: derivedName.first, last_name: derivedName.last, phone: form.phone,
        service_needed: core.selectedServices.join(", "),
        budget_flexible: false,
        budget_min: core.budgetFloor == null ? "" : String(core.budgetFloor),
        budget_max: "",
        preferred_schedule: core.schedule,
        location: formatApproxLocation(core.postalCode, core.area),
        postal_code: normalizePostal(core.postalCode),
        job_description: core.composed(core.description, true),
        job_tags: core.tags,
        job_answers: core.answers,
        client_type: clientType,
        business_name: clientType === "business" ? form.businessName : "",
        business_type: clientType === "business" ? form.businessType : "",
        locations: clientType === "business" ? form.locations : "",
        recurring: core.recurring || core.schedule === "Recurring",
        recurring_frequency: core.recurringFrequency,
        recurring_interval_km: core.recurringFrequency === "per_km" && core.recurringKm ? String(parseInt(core.recurringKm, 10) || "") : "",
        recurring_prepay_pref: String(core.prepayPref || 0),
        recurring_start_date: core.recurringStartDate,
        recurring_end_date: core.recurringEndDate,
        recurring_dates: core.recurringDates,
        billing_preference: clientType === "business" ? form.billingPreference : "",
      };
      // An accepted split: the trigger writes one row per part, atomically, and falls
      // back to the single combined row (the keys above) on any problem.
      if (splitParts && splitParts.length >= 2) {
        metadata.split_jobs = splitParts.map((p, i) => {
          const floor = floorFor(p.service, core.pricing);
          return { service_needed: p.service, job_description: core.composed(p.description, i === 0), budget_min: floor == null ? "" : String(floor) };
        });
      }
      // Pre-flight duplicate check (the DB triggers are the hard backstop). A failed check never blocks (web).
      try {
        const { data: avail } = await supabase.rpc("check_signup_availability", { p_email: form.email, p_phone: form.phone });
        const a = (avail ?? {}) as { email_taken?: boolean; phone_taken?: boolean };
        if (a.email_taken) { setSubmitError(DUPLICATE); setLoading(false); return; }
        if (a.phone_taken) { setSubmitError("An account with this phone number already exists. Please sign in, or use a different number."); setLoading(false); return; }
      } catch { /* the trigger is the backstop */ }

      // The pipeline's pending record exists BEFORE a session can (flow.ts).
      await beginSignIn("client");
      begun = true;
      // The link lands on the website until device-independent links ship (PLAN W3); it works from any device.
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: metadata, emailRedirectTo: `${WEB}/auth/callback?role=client` },
      });
      if (authErr) throw authErr;
      if (!authData.user) throw new Error("Account creation failed.");
      // Email-confirmation mode answers an existing email with a fake success (no identities).
      if ((authData.user.identities?.length ?? 0) === 0) { await abandonSignIn(); begun = false; setSubmitError(DUPLICATE); setLoading(false); return; }
      if (newsletterOptIn) {
        try { await supabase.rpc("newsletter_subscribe", { p_email: form.email, p_audience: "client", p_name: derivedName.first, p_source: "signup_checkbox" }); } catch { /* never worth a signup */ }
      }
      const userId = authData.user.id;
      // A TYPED code and the terms tick must both survive the email-confirmation detour.
      await stashReferralCode(form.referralCode);
      await stashTermsConsent("signup-client");

      if (!authData.session) {
        // Email confirmation required. The trigger already saved the request.
        await abandonSignIn(); begun = false; // no session: nothing to resume (the email link starts its own)
        trackEvent("sign_up", { method: "client" }); trackEvent("post_job");
        setVerifyEmail(true); // autosave off
        await clearDraft(ONBOARDING_DRAFT_KEY);
        setLoading(false);
        return;
      }

      // Session exists: record the acceptance now (fire and forget; the gate covers a failed write).
      redeemStashedTermsConsent().catch(() => { /* retried by the pipeline / covered by the gate */ });
      // Attach the optional photo to the request(s) the trigger just made.
      if (photo) {
        const up = await uploadImage({ bucket: "problem-photos", basePath: `${userId}/${Crypto.randomUUID()}`, asset: photo, profile: "photo" });
        if (up.ok) {
          const { error: upErr } = await supabase.from("client_requests").update({ photo_path: up.path }).eq("user_id", userId).is("photo_path", null);
          if (upErr) setPhotoWarn(true);
        } else if (up.blocked) {
          setPhotoReject(up.message);
        } else {
          setPhotoWarn(true);
        }
      }
      // The TYPED code wins over a stashed one. Never throws; a refusal is stashed for the dashboard.
      await applyReferralAtSignup(form.referralCode || (await stashedReferralCode()));
      trackEvent("sign_up", { method: "client" }); trackEvent("post_job");
      try {
        const { data: refData } = await supabase.rpc("get_my_referral");
        const rc = Array.isArray(refData) ? (refData as { code?: string }[])[0]?.code : (refData as { code?: string } | null)?.code;
        if (rc) setReferral(rc);
      } catch { /* the card just doesn't show */ }
      setSuccess(true); // autosave off
      await clearDraft(ONBOARDING_DRAFT_KEY);
      setLoading(false);
    } catch (err) {
      if (begun) await abandonSignIn();
      const msg = (err as { message?: string })?.message ?? "";
      setSubmitError(msg.includes("already registered") ? DUPLICATE : msg || "Something went wrong.");
      setLoading(false);
    }
  };

  /** Into the app through the one pipeline: two-step code if owed, then the role rules. */
  const openDashboard = async () => {
    setOpening(true); setOpenError("");
    try { await continueAfterSignIn(); }
    catch { setOpening(false); setOpenError("We couldn't open your account just now. Check your connection, then try again."); }
  };

  const share = (code: string) => {
    Share.share({ message: `Get your first Freddy Fix It service fee waived with my code ${code}: https://freddyfixit.ca/?ref=${code}` }).catch(() => {});
  };

  // ---------------------------------------------------------------- terminal screens
  if (verifyEmail) {
    return (
      <Screen>
        <View style={{ alignItems: "center", paddingTop: t.s8 }}>
          <Badge icon="mail" />
          <Txt variant="label" size={2.4} ls={0.06} accessibilityRole="header" style={{ marginTop: t.s5 }}>
            Check Your <Txt variant="label" size={2.4} ls={0.06} color={t.text}>Email</Txt>
          </Txt>
          <Txt lh={1.6} color={rgba(t.muted, 0.75)} style={{ textAlign: "center", marginTop: t.s2 }}>
            {"We sent a confirmation link to "}<Txt variant="bodyBold">{form.email}</Txt>{". Click it to activate your account."}
          </Txt>
          <Txt size={0.85} color={rgba(t.muted, 0.55)} style={{ textAlign: "center", marginTop: t.s2 }}>
            {"Your request is saved — we'll start matching you with contractors right away." + (photo ? " Once you've verified, you can add your photo from your dashboard." : "")}
          </Txt>
        </View>
        <NextSteps email={form.email} signedIn={false} />
        <Stack><Button variant="primary" full onPress={() => router.replace("/sign-in")}>Go to Sign In →</Button></Stack>
      </Screen>
    );
  }

  if (success) {
    return (
      <Screen>
        <View style={{ alignItems: "center", paddingTop: t.s8 }}>
          <Badge icon="check" />
          <Txt variant="label" size={2.6} ls={0.06} accessibilityRole="header" style={{ marginTop: t.s5 }}>
            Request <Txt variant="label" size={2.6} ls={0.06} color={t.text}>Received!</Txt>
          </Txt>
          <Txt color={rgba(t.muted, 0.7)} style={{ marginTop: t.s2 }}>We’ll be in touch within a few hours.</Txt>
        </View>
        {/* A photo problem is read first; the request itself went through either way (web). */}
        {photoWarn ? <FormNote>Heads up — your photo didn’t upload. Your request went through fine; you can add the photo again from your dashboard.</FormNote> : null}
        {photoReject ? <FormNote>{photoReject + " Your request was posted without it — you can add a different photo from your dashboard."}</FormNote> : null}
        <NextSteps email={form.email} signedIn />
        {referral ? (
          <View style={{ marginTop: t.s5, padding: t.s5, borderRadius: t.r3, backgroundColor: rgba(t.accentRgb, 0.08), borderWidth: ui.line, borderColor: rgba(t.accentRgb, 0.28) }}>
            <Txt variant="label" size={1.3} ls={0.04}>Invite a friend, they save</Txt>
            <Txt size={0.84} lh={1.5} color={rgba(t.muted, 0.75)} style={{ marginTop: t.s1 }}>
              {"Friends who join with your code get the "}<Txt variant="bodyBold" size={0.84}>3% service fee waived on their first job</Txt>.
            </Txt>
            <View style={{ flexDirection: "row", alignItems: "center", gap: t.s3, marginTop: t.s4, flexWrap: "wrap" }}>
              <View style={{ paddingHorizontal: t.s4, paddingVertical: t.s1, borderRadius: t.r2, borderWidth: ui.line, borderStyle: "dashed", borderColor: rgba(t.accentRgb, 0.5) }}>
                <Txt variant="label" size={1.6} ls={0.12} color={t.text} selectable>{referral}</Txt>
              </View>
              <Button onPress={() => share(referral)}>Share code</Button>
            </View>
          </View>
        ) : null}
        {openError ? <FormNote>{openError}</FormNote> : null}
        <Stack><Button variant="primary" full loading={opening} onPress={() => void openDashboard()}>My Dashboard →</Button></Stack>
      </Screen>
    );
  }

  // Waitlist: placed AFTER the terminal screens so someone who signed up a moment
  // before the switch flipped still sees their confirmation (web).
  if (platformReady && !acceptingRequests(platform.mode)) {
    return (
      <Screen>
        <ScreenHeader title="Get a repair done" onBack={() => (router.canGoBack() ? router.back() : router.replace("/welcome"))} />
        <WaitlistCard source="client_onboarding" initialService={core.selectedServices[0] || ""} initialDescription={core.description} initialEmail={form.email} />
      </Screen>
    );
  }

  // ---------------------------------------------------------------- the form
  const pos = Math.max(1, visiblePath.indexOf(step) + 1);
  const isLast = pos === visiblePath.length;
  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <Screen key={step}>
      <ScreenHeader title="Get a repair done" onBack={back} />
      <StepProgress step={pos} total={visiblePath.length} />
      {restored ? <DraftBanner onStartOver={onStartOver} /> : null}
      <StepTitle>{STEP_TITLES[step - 1]}</StepTitle>

      <FormCard>
        {step === S_DESCRIBE ? (
          <>
            <Field label="What needs fixing?" multiline value={core.description} error={errors.jobDescription || null}
              placeholder="e.g. My kitchen tap has been dripping for a week and the cupboard underneath is damp."
              onChangeText={(v) => { core.setDescription(v); clearErr("jobDescription"); }} />
            <Note>No need to know the trade name — plain English is perfect. We’ll work out who to send.</Note>
            <Field label="Your email" value={form.email} onChangeText={(v) => set("email", v)} error={errors.email || null}
              keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" autoCorrect={false} placeholder="alex@email.com" />
            <Note>This is where your estimates land. You’ll pick a password at the end — nothing is sent until then.</Note>
            <LocationBlock core={core} error={errors.location} label="Where's the job?" onEdit={() => clearErr("location")} />
          </>
        ) : null}

        {step === S_PHOTO ? (
          <>
            <Label first aside={nudged && !photo ? "*" : "(optional)"}>Photo of the Problem</Label>
            <PhotoPicker asset={photo} onPick={(a) => { setSubmitError(""); setPhoto(a); }} onRemove={() => setPhoto(null)} onError={setSubmitError} />
            <Note>We shrink it for you before it’s sent, so a photo straight off your phone is fine.</Note>
            {nudged && !photo ? <PhotoNudge /> : null}
          </>
        ) : null}

        {step === S_CONFIRM ? (
          <ServiceConfirm core={core} error={errors.serviceNeeded} tagNote="These ride along to your pro. Tap any that don't apply." />
        ) : null}

        {step === S_DETAILS ? (
          <>
            <QuestionsBlock core={core} />
            {core.activeQuestions.length > 0 ? <View style={{ height: t.hairW, backgroundColor: rgba(t.fg, 0.08), marginBottom: t.s2 }} /> : null}
            <Label>I am requesting as</Label>
            <View style={{ flexDirection: "row", gap: t.s2 }}>
              <View style={{ flex: 1 }}><ChoiceRow title="Just me / household" on={clientType === "individual"} onPress={() => setClientType("individual")} /></View>
              <View style={{ flex: 1 }}><ChoiceRow title="A small business" on={clientType === "business"} onPress={() => setClientType("business")} /></View>
            </View>
            {clientType === "business" ? (
              <View style={{ paddingBottom: t.s4, borderBottomWidth: t.hairW, borderBottomColor: rgba(t.fg, 0.08) }}>
                <Label>Business details</Label>
                <Field label="Business name" value={form.businessName} onChangeText={(v) => set("businessName", v)} placeholder="Acme Property Mgmt" />
                <Field label="Business type" value={form.businessType} onChangeText={(v) => set("businessType", v)} placeholder="e.g. Property mgmt, Cafe" />
                <Field label="Locations / sites (if more than one)" multiline value={form.locations} onChangeText={(v) => set("locations", v)}
                  placeholder="List the addresses or number of sites we would be servicing." />
                <Field label="Billing preference" value={form.billingPreference} onChangeText={(v) => set("billingPreference", v)} placeholder="e.g. Net-30 invoicing, PO required" />
                <Tick checked={core.recurring} onChange={core.setRecurring} label="This is recurring / scheduled maintenance">
                  <Txt size={0.88}>This is recurring / scheduled maintenance</Txt>
                </Tick>
              </View>
            ) : null}
            <ScheduleBlock core={core} label="When Do You Need It?" error={errors.preferredSchedule} onPicked={() => clearErr("preferredSchedule")} />
            <BudgetNote services={core.selectedServices} pricing={core.pricing} />
          </>
        ) : null}

        {step === S_ACCOUNT ? (
          <>
            <Field label="Email" value={form.email} onChangeText={(v) => set("email", v)} error={errors.email || null}
              keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="username" autoCorrect={false} placeholder="alex@email.com"
              hint={form.email.trim() ? "This is the address you gave us at the start — change it here if it’s wrong." : "Your estimates and your sign-in confirmation both go here."} />
            <Field label="Phone (so we can text you when estimates arrive)" value={form.phone} onChangeText={(v) => set("phone", fmtPhone(v))} error={errors.phone || null}
              keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="403-555-0100" />
            <PasswordField label="Password (for your account)" meter newPassword value={form.password} onChangeText={(v) => set("password", v)}
              onBreachChange={setPwBreached} error={errors.password || null} />
            <Note>At least 8 characters. Length beats symbols — four random words is stronger than one word with punctuation.</Note>
            <Field label="Referral code (optional)" value={form.referralCode} onChangeText={(v) => set("referralCode", v.toUpperCase())}
              autoCapitalize="characters" autoCorrect={false} maxLength={24} placeholder="A friend's code"
              hint="Referred by someone? Enter their code and we’ll waive the 3% service fee on your first job. Prefilled automatically if you arrived from an invite link." />
            <TermsTick adult checked={agreedToTerms} onChange={(v) => { setAgreedToTerms(v); if (v) setSubmitError(""); }} />
            <Tick checked={newsletterOptIn} onChange={setNewsletterOptIn} label="Email me practical Calgary home and vehicle tips">
              <Txt size={0.82} lh={1.6} color={rgba(t.muted, 0.75)}>Email me practical Calgary home &amp; vehicle tips (about once a week — unsubscribe anytime).</Txt>
            </Tick>
          </>
        ) : null}

        {hasErrors ? <ErrorText>Please check the highlighted answers above.</ErrorText> : null}
        {submitError ? <FormNote>{submitError}</FormNote> : null}
      </FormCard>

      <FormNav backLabel="← Back" onBack={back} busy={loading}
        nextLabel={!isLast ? "Next →" : loading ? "Submitting…" : "Submit Request →"}
        onNext={!isLast ? next : () => void handleSubmit()} />

      <SplitSheet parts={splitSuggestion}
        onKeepOne={() => { setSplitSuggestion(null); void handleSubmit("one"); }}
        onSplit={(parts) => { setSplitSuggestion(null); void handleSubmit(parts); }} />
    </Screen>
  );
}

function Badge({ icon }: { icon: "mail" | "check" }) {
  const { t } = useTheme();
  return (
    <View style={{ width: ui.photoTile, height: ui.photoTile, borderRadius: ui.pill, alignItems: "center", justifyContent: "center",
      backgroundColor: rgba(t.accentRgb, 0.15), borderWidth: ui.edge, borderColor: rgba(t.accentRgb, 0.4) }}>
      <Ic name={icon} size={ui.icon.xl * 1.6} color={t.text} />
    </View>
  );
}
