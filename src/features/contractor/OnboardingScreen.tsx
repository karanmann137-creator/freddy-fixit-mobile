// Contractor signup + onboarding (PLAN step 5.2): port of web pages/ContractorOnboarding.tsx.
// One screen, two branches, as on web:
//   * SIGNED OUT: the five steps create the account. Every answer travels as signUp()
//     metadata, so handle_new_user() writes the profile + contractors row even when
//     email confirmation means there is no session yet.
//   * SIGNED IN (Google/Apple, the role chooser, or a contractor with no contractors
//     row): the same five steps complete the contractor profile. The role is written
//     through setMyRole() (the only role write), separately from the details (web).
//
// Auth goes through the app's one pipeline (features/auth/flow.ts), like the client
// funnel: beginSignIn("contractor") BEFORE signUp → abandonSignIn on any failure or
// when no session exists → continueAfterSignIn when they open the app. So the
// two-step code and the established-role rules apply (an admin is never demoted:
// resolveDestination), and a kill after the session exists resumes on relaunch.
// Google/Apple on step 1 use the same pipeline with the same intent.
//
// "Onboarded?" is ONE test, destination.ts's contractorHome (a contractors row
// exists): it decides whether this screen shows at all, and where "My Dashboard" goes.
//
// Same rows, same columns, same calls as web: check_signup_availability, signUp,
// newsletter_subscribe, accept_terms (via the terms stash), ensure_profile,
// setMyRole, profiles update, contractor-photos (avatar profile, public URL),
// contractor-docs (document profile; PDFs pass through), contractors upsert, and
// review-contractor (fire and forget, only when a document was uploaded).
//
// Not here, by decision (PLAN §3.3): TrustNumbers, OnboardingVideo, VoiceDictate.
// Stripe payouts: web does not start Connect during onboarding (it's on the
// dashboard), so nothing here hands off to it; that's step 5.3.
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, DeadEnd, Field, FormNote, Ic, Row, Screen, ScreenHeader, Stack, Txt, rgba, ui, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { readAuthUser } from "@/lib/authRead";
import { clearMyProfile, getMyProfile } from "@/lib/myProfile";
import { setMyRole } from "@/lib/roleWrite";
import { redeemStashedTermsConsent, stashTermsConsent } from "@/lib/terms";
import { trackEvent } from "@/lib/analytics";
import { AREAS, areasFromPostal, isPostalCode } from "@/lib/calgaryAreas";
import { fmtPhone, validateEmail, validatePhone } from "@/lib/emailValidation";
import { AVAIL_DAYS, DEFAULT_END, DEFAULT_START, WEEKDAYS } from "@/lib/availability";
import type { UploadAsset } from "@/lib/imageCompress";
import { kvGetJson, kvRemove, kvSetJson } from "@/platform/storage";
import { uploadImage } from "@/platform/upload";
import { PasswordField } from "@/features/auth/PasswordField";
import { OAuthButtons } from "@/features/auth/OAuthButtons";
import { abandonSignIn, beginSignIn, continueAfterSignIn, go } from "@/features/auth/flow";
import { contractorHome } from "@/features/auth/destination";
import { WEB, openOnWeb } from "@/features/client/web";
import {
  Chip, Chips, ChoiceRow, DraftBanner, ErrorText, FormCard, FormNav, Label, LinkButton, Note, ServicePicker, StepProgress, StepTitle, TermsTick, Tick,
} from "@/features/request/pieces";
import {
  AVATAR_MAX_BYTES, AVATAR_TOO_BIG, CONTRACTOR_DRAFT_KEY, DOC_KEYS, DOC_MAX_BYTES, DOC_NAMES, DOC_TOO_BIG, SPECIALTIES, STEP_TITLES, WORK_TYPES,
  docList, namesFromEmail, type DocKey,
} from "./webPage";
import { AvatarPicker, DocSlot, TimeSelect } from "./onboardingPieces";

const TOTAL = 5;
const DUPLICATE = "An account with this email already exists. Please sign in instead.";
const OFFLINE = "We couldn't reach Freddy Fix It just now. Check your connection, then try again.";

type Draft = {
  form?: Partial<FormState>; selectedSpec?: unknown; selectedArea?: unknown; postalCode?: unknown;
  availDays?: unknown; availStart?: unknown; availEnd?: unknown; step?: unknown;
};
type FormState = {
  firstName: string; lastName: string; email: string; phone: string; companyName: string; password: string; yearsOfExperience: string;
  workType: string; licensed: boolean; licenseNumber: string; hasInsurance: boolean; insuranceProvider: string; insuranceExpiry: string;
  hasWcb: boolean; operatesAlone: boolean; workReferences: string;
};
type Signed = { userId: string; email: string; first: string; last: string };
type Mode =
  | { kind: "loading" }
  | { kind: "stalled" }
  | { kind: "ready"; signed: Signed | null; draft: Draft | null };

const strArr = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);

/** Who is here, and should they be? Three outcomes, then contractorHome (destination.ts). */
async function check(): Promise<Mode | "left"> {
  const who = await readAuthUser();
  if (who.kind === "unknown") return { kind: "stalled" };
  const draft = await kvGetJson<Draft>(CONTRACTOR_DRAFT_KEY);
  if (who.kind === "signedOut") return { kind: "ready", signed: null, draft };
  const prof = await getMyProfile(who.userId);
  if (!prof.ok) return { kind: "stalled" };
  if (prof.role === "admin") { go({ kind: "admin" }); return "left"; } // an established admin wins (destination.ts)
  const home = await contractorHome(who.userId);
  if (home.kind === "error") return { kind: "stalled" };
  if (home.kind !== "contractorOnboarding") { go(home); return "left"; } // already onboarded: same test as the pipeline
  // Prefill the name from Google/Apple metadata, else the email (web). Editable; a draft wins.
  let first = "", last = "";
  try {
    const { data } = await supabase.auth.getSession();
    const m = (data.session?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const s = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : "");
    const full = (s("full_name") || s("name")).trim();
    const guess = namesFromEmail(who.email ?? "");
    first = s("given_name") || s("first_name") || full.split(/\s+/)[0] || guess.first;
    last = s("family_name") || s("last_name") || full.split(/\s+/).slice(1).join(" ") || guess.last;
  } catch { /* prefill only: an empty name field is fine */ }
  return { kind: "ready", signed: { userId: who.userId, email: who.email ?? "", first, last }, draft };
}

export function ContractorOnboardingScreen() {
  const { t } = useTheme();
  const [mode, setMode] = useState<Mode>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [gen, setGen] = useState(0);
  // Set the moment a submit starts: from then on an auth event is this screen's OWN
  // signUp, and must not re-run the check under a form that's mid-save.
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    void check().catch((): Mode => ({ kind: "stalled" })).then((m) => { if (alive && m !== "left") setMode(m); });
    return () => { alive = false; };
  }, [attempt]);

  // Signed out, a Google/Apple sign-in from step 1 creates a session here; the pipeline
  // then routes back to this same screen. Re-check so the form switches to the
  // signed-in branch either way. Synchronous only inside the callback (auth-lock rule).
  const signedOut = mode.kind === "ready" && !mode.signed;
  useEffect(() => {
    if (!signedOut) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" && !busy.current) setAttempt((n) => n + 1);
    });
    return () => data.subscription.unsubscribe();
  }, [signedOut]);

  if (mode.kind === "stalled") {
    return <DeadEnd msg="We couldn't check your account just now. Nothing is wrong with it — check your connection, then try again."
      onRetry={() => { setMode({ kind: "loading" }); setAttempt((n) => n + 1); }}
      alt={<Button variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>Back</Button>} />;
  }
  if (mode.kind === "loading") {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }} accessibilityLabel="Loading"><ActivityIndicator color={t.text} /></View>;
  }
  return (
    <OnboardingForm key={`${mode.signed?.userId ?? "out"}:${gen}`} signed={mode.signed} draft={gen ? null : mode.draft}
      onStartOver={() => { void kvRemove(CONTRACTOR_DRAFT_KEY); setGen((g) => g + 1); }}
      onLock={() => { busy.current = true; }} />
  );
}

function OnboardingForm({ signed, draft, onStartOver, onLock }: { signed: Signed | null; draft: Draft | null; onStartOver: () => void; onLock: () => void }) {
  const { t } = useTheme();
  const authedUserId = signed?.userId ?? null;
  const df = draft?.form ?? {};
  const ds = (k: keyof FormState) => (typeof df[k] === "string" ? (df[k] as string) : "");
  const db = (k: keyof FormState) => df[k] === true;

  const [step, setStep] = useState(() => { const s = Number(draft?.step); return Number.isInteger(s) && s >= 1 && s <= TOTAL ? s : 1; });
  // The password is never restored: it is never stored (web).
  const [form, setForm] = useState<FormState>(() => ({
    firstName: ds("firstName") || signed?.first || "", lastName: ds("lastName") || signed?.last || "",
    email: signed ? signed.email : ds("email"), phone: ds("phone"), companyName: ds("companyName"), password: "",
    yearsOfExperience: ds("yearsOfExperience"), workType: ds("workType"),
    licensed: db("licensed"), licenseNumber: ds("licenseNumber"), hasInsurance: db("hasInsurance"), insuranceProvider: ds("insuranceProvider"),
    insuranceExpiry: ds("insuranceExpiry"), hasWcb: db("hasWcb"), operatesAlone: db("operatesAlone"), workReferences: ds("workReferences"),
  }));
  const [pwBreached, setPwBreached] = useState(false);
  const [selectedSpec, setSelectedSpec] = useState<string[]>(() => strArr(draft?.selectedSpec) ?? []);
  const [selectedArea, setSelectedArea] = useState<string[]>(() => strArr(draft?.selectedArea) ?? []);
  // A postal code is only a CONVENIENCE that pre-ticks zone chips. It is never stored (web).
  const [postalCode, setPostalCode] = useState(() => (typeof draft?.postalCode === "string" ? draft.postalCode : ""));
  const [zoneHint, setZoneHint] = useState<string[]>([]);
  const [availDays, setAvailDays] = useState<string[]>(() => strArr(draft?.availDays) ?? [...WEEKDAYS]);
  const [availStart, setAvailStart] = useState(() => (typeof draft?.availStart === "string" && draft.availStart ? draft.availStart : DEFAULT_START));
  const [availEnd, setAvailEnd] = useState(() => (typeof draft?.availEnd === "string" && draft.availEnd ? draft.availEnd : DEFAULT_END));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [refused, setRefused] = useState(false);       // setMyRole's PERMANENT refusal: offer the way out
  const [agreedToTerms, setAgreedToTerms] = useState(false);   // consent: never restored
  const [newsletterOptIn, setNewsletterOptIn] = useState(false); // CASL: never pre-ticked, never restored
  const [photo, setPhoto] = useState<UploadAsset | null>(null);
  const [docFiles, setDocFiles] = useState<Record<DocKey, UploadAsset | null>>({ insurance: null, wcb: null, certification: null, gov_id: null });
  const [success, setSuccess] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState(false);
  const [uploadWarn, setUploadWarn] = useState("");
  // Set once signUp has returned a SESSION: a retry after a later failure must not
  // create the auth user a second time (that answers "already registered").
  const [signedUpId, setSignedUpId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");

  // Autosave (web saves on every change; debounced here like requestDraft). Files
  // can't be persisted, and the password never is.
  const saving = !success && !verifyEmail && !loading;
  const draftJson = JSON.stringify({ form: { ...form, password: "" }, selectedSpec, selectedArea, postalCode, availDays, availStart, availEnd, step });
  useEffect(() => {
    if (!saving) return;
    const tm = setTimeout(() => { void kvSetJson(CONTRACTOR_DRAFT_KEY, JSON.parse(draftJson)); }, 600);
    return () => clearTimeout(tm);
  }, [draftJson, saving]);

  const wt = WORK_TYPES.find((w) => w.id === form.workType);
  const setF = (key: keyof FormState, val: string) => { setForm((f) => ({ ...f, [key]: val })); setErrors((e) => ({ ...e, [key]: "" })); };
  const setFB = (key: keyof FormState, val: boolean) => setForm((f) => ({ ...f, [key]: val }));
  // "Other" is the opt-in to jobs outside the pro's trades, not a trade itself (web).
  const realSpecs = selectedSpec.filter((x) => x !== "Other");
  const toggleSpec = (l: string) => { setSelectedSpec((p) => (p.includes(l) ? p.filter((x) => x !== l) : [...p, l])); setErrors((e) => ({ ...e, spec: "" })); };
  const toggleArea = (z: string) => { setSelectedArea((p) => (p.includes(z) ? p.filter((x) => x !== z) : [...p, z])); setErrors((e) => ({ ...e, area: "" })); };
  const toggleDay = (d: string) => { setAvailDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d])); setErrors((e) => ({ ...e, avail: "" })); };
  const setDays = (days: string[]) => { setAvailDays(days); setErrors((e) => ({ ...e, avail: "" })); };

  // The postal box only ever ADDS zones, never unticks one (web).
  const onPostal = (v: string) => {
    setPostalCode(v);
    if (!isPostalCode(v)) { setZoneHint([]); return; }
    const added = areasFromPostal(v).filter((z) => AREAS.includes(z) && !selectedArea.includes(z));
    if (!added.length) return;
    setSelectedArea((prev) => [...prev, ...added.filter((z) => !prev.includes(z))]);
    setZoneHint(added);
    setErrors((e) => ({ ...e, area: "" }));
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (step === 1) {
      if (!form.firstName.trim()) errs.firstName = "Required";
      if (!form.lastName.trim()) errs.lastName = "Required";
      if (!authedUserId) { const ev = validateEmail(form.email); if (!ev.ok) errs.email = ev.error!; }
      { const pv = validatePhone(form.phone, true); if (!pv.ok) errs.phone = pv.error!; }
      if (!authedUserId && form.password.length < 8) errs.password = "Minimum 8 characters";
      else if (!authedUserId && pwBreached) errs.password = "This password has appeared in public data breaches. Please choose a different one.";
    }
    if (step === 2) {
      if (realSpecs.length === 0) errs.spec = "Select at least one service you offer";
      if (!form.workType) errs.workType = "Select what best describes your work";
    }
    if (step === 3) {
      if (selectedArea.length === 0) errs.area = "Select at least one area";
      if (availDays.length === 0) errs.avail = "Pick at least one day you're available";
      else if (availEnd <= availStart) errs.avail = "End time must be after the start time";
    }
    // Step 5: documents and the photo are OPTIONAL at signup (web).
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => { if (validate()) setStep((s) => s + 1); };
  const back = () => {
    if (step === 1) { if (router.canGoBack()) router.back(); else router.replace("/"); return; }
    setStep((s) => s - 1);
  };

  const handleSubmit = async () => {
    if (loading) return;
    if (!agreedToTerms) { setSubmitError("You must agree to the User Agreement and Privacy Policy to continue."); return; }
    onLock();
    setLoading(true); setSubmitError(""); setRefused(false);
    let begun = false;
    try {
      // Every answer as signup metadata: handle_new_user() writes the profile +
      // contractors row even when there is no session yet (web).
      const metadata: Record<string, unknown> = {
        role: "contractor",
        first_name: form.firstName, last_name: form.lastName, phone: form.phone,
        company_name: form.companyName,
        specialties: selectedSpec,
        service_area: selectedArea,
        availability: { days: availDays, start: availStart, end: availEnd },
        work_type: form.workType,
        years_of_experience: form.yearsOfExperience,
        licensed: form.licensed, license_number: form.licenseNumber,
        has_liability_insurance: form.hasInsurance, insurance_provider: form.insuranceProvider,
        insurance_expiry: form.insuranceExpiry, has_wcb: form.operatesAlone ? false : form.hasWcb,
        operates_alone: form.operatesAlone,
        work_references: form.workReferences,
      };

      let userId = authedUserId ?? signedUpId;
      if (!userId) {
        // Block duplicate accounts by email or phone. A failed check never blocks (web).
        try {
          const { data: avail } = await supabase.rpc("check_signup_availability", { p_email: form.email, p_phone: form.phone });
          const a = (avail ?? {}) as { email_taken?: boolean; phone_taken?: boolean };
          if (a.email_taken) { setSubmitError(DUPLICATE); setLoading(false); return; }
          if (a.phone_taken) { setSubmitError("An account with this phone number already exists. Please sign in, or use a different number."); setLoading(false); return; }
        } catch { /* the DB triggers are the backstop */ }

        // The pipeline's pending record (contractor intent) exists BEFORE a session can.
        await beginSignIn("contractor");
        begun = true;
        // The link lands on the website until device-independent links ship (PLAN W3); it works from any device.
        const { data: authData, error: authErr } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: metadata, emailRedirectTo: `${WEB}/auth/callback?role=contractor` },
        });
        if (authErr) throw authErr;
        if (!authData.user) throw new Error("Account creation failed.");
        // Email-confirmation mode answers an existing email with a fake success (no identities).
        if ((authData.user.identities?.length ?? 0) === 0) { await abandonSignIn(); begun = false; setSubmitError(DUPLICATE); setLoading(false); return; }
        // Weekly pro-tips opt-in (CASL express consent; never pre-ticked).
        if (newsletterOptIn) {
          try { await supabase.rpc("newsletter_subscribe", { p_email: form.email, p_audience: "contractor", p_name: form.firstName, p_source: "signup_checkbox" }); } catch { /* never worth a signup */ }
        }
        userId = authData.user.id;
        // The tick must survive the email-confirmation detour: it is the legal record (terms.ts).
        await stashTermsConsent("signup-contractor");
        if (!authData.session) {
          // Email confirmation required. The trigger already saved the profile + contractor details.
          await abandonSignIn(); begun = false; // no session: nothing to resume (the email link starts its own)
          await kvRemove(CONTRACTOR_DRAFT_KEY);
          trackEvent("sign_up", { method: "contractor" });
          setVerifyEmail(true);
          setLoading(false);
          return;
        }
        // A session exists: the pending record now belongs to the pipeline (continueAfterSignIn clears it).
        begun = false;
        setSignedUpId(userId);
      } else if (authedUserId) {
        // Already signed in: the tick was still shown and validated, so there IS one to record (web).
        await stashTermsConsent("signup-contractor");
        // Make sure a profiles row exists, then the role, written SEPARATELY from the details (web).
        await supabase.rpc("ensure_profile", { p_role: "contractor" });
        const w = await setMyRole(userId, "contractor");
        if (!w.ok) {
          // A settled refusal is shown as is; a transient one gets the app's words (roleWrite says "refresh the page").
          setSubmitError(w.permanent ? w.reason : OFFLINE); setRefused(w.permanent); setLoading(false); return;
        }
        const { error: profErr } = await supabase.from("profiles")
          .update({ first_name: form.firstName, last_name: form.lastName || null, phone: form.phone || null })
          .eq("id", userId);
        if (profErr) throw profErr;
        clearMyProfile();
        if (newsletterOptIn) {
          try { await supabase.rpc("newsletter_subscribe", { p_email: form.email, p_audience: "contractor", p_name: form.firstName, p_source: "signup_checkbox" }); } catch { /* never worth a signup */ }
        }
      }

      // Both branches reach here with a session: record the tick now. Never worth an
      // account: on failure the stash survives for the pipeline (web).
      redeemStashedTermsConsent().catch(() => { /* retried by the pipeline / covered by the gate */ });

      let photoPublicUrl: string | null = null;
      const failedUploads: string[] = [];
      if (photo) {
        // web uploads these without a safety scan, so scan: false keeps the two clients identical.
        const up = await uploadImage({ bucket: "contractor-photos", basePath: `${userId}/avatar`, asset: photo, profile: "avatar", upsert: true, scan: false });
        if (up.ok) photoPublicUrl = supabase.storage.from("contractor-photos").getPublicUrl(up.path).data?.publicUrl ?? null;
        else failedUploads.push("profile photo");
      }
      // Verification documents. "document" is the gentle profile: the AI reviewer and the
      // owner read the small print. PDFs pass straight through compressImage (web).
      const docUrls: Record<string, string> = {};
      for (const key of DOC_KEYS) {
        const file = docFiles[key];
        if (!file) continue;
        const up = await uploadImage({ bucket: "contractor-docs", basePath: `${userId}/${key}`, asset: file, profile: "document", upsert: true, scan: false });
        if (up.ok) docUrls[key] = up.path;
        else failedUploads.push(DOC_NAMES[key] ?? key);
      }
      setUploadWarn(failedUploads.join(", "));

      const { error: conErr } = await supabase.from("contractors").upsert({
        id: userId, company_name: form.companyName || null, specialties: selectedSpec,
        years_of_experience: form.yearsOfExperience === "" ? null : Number(form.yearsOfExperience),
        service_area: selectedArea, availability: { days: availDays, start: availStart, end: availEnd },
        work_type: form.workType || null, photo_url: photoPublicUrl, licensed: form.licensed, license_number: form.licenseNumber || null,
        has_liability_insurance: form.hasInsurance, insurance_provider: form.insuranceProvider || null, insurance_expiry: form.insuranceExpiry || null,
        has_wcb: form.operatesAlone ? false : form.hasWcb, operates_alone: form.operatesAlone, work_references: form.workReferences || null,
        status: "pending", doc_urls: docUrls,
      });
      if (conErr) throw conErr;

      // Automated document review: non-blocking, exactly as web (its result lands on the
      // contractors row; nothing here reads the response).
      if (Object.keys(docUrls).length > 0) {
        supabase.functions.invoke("review-contractor", { body: { contractor_id: userId } }).catch(() => { /* web: non-blocking */ });
      }

      await kvRemove(CONTRACTOR_DRAFT_KEY);
      trackEvent("sign_up", { method: "contractor" });
      setSuccess(true);
    } catch (err) {
      if (begun) await abandonSignIn();
      const msg = (err as { message?: string })?.message ?? "";
      // Everything typed is still in the form, so say so: a blank failure invites endless retries (web).
      setSubmitError(msg.includes("already registered") ? DUPLICATE : msg || "Something went wrong. Nothing you typed has been lost — try again.");
    } finally {
      setLoading(false);
    }
  };

  /** Into the app. A new signup goes through the pipeline (two-step code, role rules, and
   *  it clears the pending record); a signed-in person goes where contractorHome says. */
  const openDashboard = async () => {
    setOpening(true); setOpenError("");
    try {
      if (signedUpId) { await continueAfterSignIn(); return; }
      const d = await contractorHome(authedUserId!);
      if (d.kind === "error") { setOpening(false); setOpenError(d.msg); return; }
      go(d);
    } catch { setOpening(false); setOpenError(OFFLINE); }
  };

  // ---------------------------------------------------------------- terminal screens
  if (verifyEmail) {
    const picked = !!photo || Object.values(docFiles).some(Boolean);
    return (
      <Screen>
        <View style={{ alignItems: "center", paddingTop: t.s8 }}>
          <Badge icon="mail" />
          <Txt variant="label" size={2.6} ls={0.06} accessibilityRole="header" style={{ marginTop: t.s5 }}>Verify Your Email</Txt>
          <Txt lh={1.6} color={rgba(t.muted, 0.7)} style={{ textAlign: "center", marginTop: t.s2 }}>
            {"We sent a confirmation link to "}<Txt variant="bodyBold">{form.email}</Txt>{". Click it to activate your account and sign in."}
          </Txt>
          <Txt size={0.85} color={rgba(t.muted, 0.55)} style={{ textAlign: "center", marginTop: t.s2 }}>
            Your details are saved. After verifying, sign in and upload any remaining documents from your profile.
          </Txt>
        </View>
        {picked ? <FormNote>One thing: the files you picked can’t be uploaded until your email is verified — please re-add your photo/documents from your profile on freddyfixit.ca after signing in.</FormNote> : null}
        <Stack><Button variant="primary" full onPress={() => router.replace("/sign-in")}>Go to Sign In →</Button></Stack>
      </Screen>
    );
  }

  if (success) {
    return (
      <Screen>
        <View style={{ alignItems: "center", paddingTop: t.s8 }}>
          <Badge icon="check" />
          <Txt variant="label" size={2.8} ls={0.06} accessibilityRole="header" style={{ marginTop: t.s5 }}>Welcome to the Team!</Txt>
          <Txt color={rgba(t.muted, 0.65)} style={{ marginTop: t.s2, textAlign: "center" }}>Your profile has been submitted. We’ll review it within 24 hours.</Txt>
        </View>
        {uploadWarn ? (
          <>
            <FormNote>{`Heads up — we couldn’t upload your ${uploadWarn}. Please add ${uploadWarn.includes(",") ? "them" : "it"} again from your profile.`}</FormNote>
            {/* The app's profile tab is step 5.4; until then the website's is the honest place. */}
            <Card style={{ marginTop: t.s4 }}>
              <Row icon="file" tone="neutral" title="Add documents on the website" sub="Your profile on freddyfixit.ca" chevron onPress={() => openOnWeb("/contractor-dashboard")} />
            </Card>
          </>
        ) : null}
        {openError ? <FormNote>{openError}</FormNote> : null}
        <Stack><Button variant="primary" full loading={opening} onPress={() => void openDashboard()}>My Dashboard →</Button></Stack>
      </Screen>
    );
  }

  // ---------------------------------------------------------------- the form
  const hasErrors = Object.values(errors).some(Boolean);
  const isWeekdays = availDays.length === 5 && WEEKDAYS.every((d) => availDays.includes(d));
  const isEvery = availDays.length === 7;
  const docs = docList(wt, form.operatesAlone);
  const pickDoc = (key: DocKey) => (a: UploadAsset) => { setDocFiles((p) => ({ ...p, [key]: a })); setSubmitError(""); };
  const dropDoc = (key: DocKey) => () => setDocFiles((p) => ({ ...p, [key]: null }));

  return (
    <Screen key={step}>
      <ScreenHeader title={authedUserId ? "Finish your profile" : "Join as a contractor"} onBack={back} />
      <StepProgress step={step} total={TOTAL} />
      {draft ? <DraftBanner onStartOver={onStartOver} /> : null}
      {draft ? <Note tight>You’ll just need to re-attach any files.</Note> : null}
      <StepTitle>{STEP_TITLES[step - 1]}</StepTitle>

      <FormCard>
        {step === 1 ? (
          <>
            {!authedUserId ? (
              <>
                <OAuthButtons wantedRole="contractor" signInSurface={false} />
                <Txt size={0.78} color={rgba(t.muted, 0.5)} style={{ textAlign: "center", marginTop: t.s4 }}>or with your email</Txt>
              </>
            ) : null}
            <View style={{ flexDirection: "row", gap: t.s3 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Field label="First name" value={form.firstName} onChangeText={(v) => setF("firstName", v)} error={errors.firstName || null}
                  autoComplete="given-name" textContentType="givenName" placeholder="Mike" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Field label="Last name" value={form.lastName} onChangeText={(v) => setF("lastName", v)} error={errors.lastName || null}
                  autoComplete="family-name" textContentType="familyName" placeholder="Taylor" />
              </View>
            </View>
            {!authedUserId ? (
              <Field label="Email" value={form.email} onChangeText={(v) => setF("email", v)} error={errors.email || null}
                keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="username" autoCorrect={false} placeholder="mike@email.com"
                onBlur={() => {
                  // Prefill empty name fields from the email; editable, never overwrites typing (web).
                  const g = namesFromEmail(form.email);
                  setForm((f) => ({ ...f, firstName: f.firstName || g.first, lastName: f.lastName || g.last }));
                }} />
            ) : null}
            <Field label="Phone (so we can call you about jobs)" value={form.phone} onChangeText={(v) => setF("phone", fmtPhone(v))} error={errors.phone || null}
              keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="403-555-0100" />
            {!authedUserId ? (
              <>
                <PasswordField label="Password (for your account)" meter newPassword value={form.password} onChangeText={(v) => setF("password", v)}
                  onBreachChange={setPwBreached} error={errors.password || null} />
                <Note>At least 8 characters. Length beats symbols — four random words is stronger than one word with punctuation.</Note>
              </>
            ) : null}
            <View style={{ flexDirection: "row", gap: t.s3 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Field label="Years of experience (optional)" value={form.yearsOfExperience} onChangeText={(v) => setF("yearsOfExperience", v.replace(/\D/g, ""))}
                  keyboardType="number-pad" maxLength={2} placeholder="e.g. 5" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Field label="Company (optional)" value={form.companyName} onChangeText={(v) => setF("companyName", v)} placeholder="Kelly Home Repairs" />
              </View>
            </View>
            <Note>Free account — no monthly fees, no upfront cost.</Note>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Label first>Services You Offer</Label>
            {realSpecs.length > 0 ? (
              <>
                <Chips>{realSpecs.map((sv) => <Chip key={sv} label={sv} on removable onPress={() => toggleSpec(sv)} />)}</Chips>
                <Note>{`${realSpecs.length} selected — tap one to remove it. Add more below.`}</Note>
              </>
            ) : (
              <Note>Search or tap everything you’re comfortable taking on. You can change this anytime.</Note>
            )}
            <ErrorText>{errors.spec}</ErrorText>
            <ServicePicker items={SPECIALTIES} allowCustom={false} selected={selectedSpec} onToggle={toggleSpec}
              placeholder="Search your trade (e.g. plumbing, drywall, snow)…" />
            <Tick checked={selectedSpec.includes("Other")} onChange={() => toggleSpec("Other")} label="Also send me jobs outside my specialties">
              <Txt size={0.88}>Also send me jobs outside my specialties</Txt>
            </Tick>

            <View style={{ marginTop: t.s6, paddingTop: t.s5, borderTopWidth: t.hairW, borderTopColor: rgba(t.fg, 0.08) }}>
              <Label first>Your Line of Work</Label>
              <Note tight>Pick the option that fits most of your work. This is how we know what to ask for next — a furniture mover or assembler doesn’t need a trade licence, while electrical or plumbing work does.</Note>
              <View style={{ marginTop: t.s4 }}>
                {WORK_TYPES.map((w) => (
                  <ChoiceRow key={w.id} title={w.label} sub={w.sub} on={form.workType === w.id}
                    onPress={() => { setForm((f) => ({ ...f, workType: w.id })); setErrors((e) => ({ ...e, workType: "" })); }} />
                ))}
              </View>
              <ErrorText>{errors.workType}</ErrorText>
              {wt ? (
                <InfoBox>
                  {wt.licence === "required"
                    ? "This is a regulated trade in Alberta — we'll ask for your provincial trade licence and proof of liability insurance."
                    : wt.licence === "optional"
                      ? "No provincial trade licence is required to sign up. Liability insurance is expected for this kind of work; a trade certificate is optional but helps you stand out."
                      : "No trade licence is required for this kind of work. Liability insurance is recommended — it protects you and reassures clients — but it's optional and you can add it later."}
                </InfoBox>
              ) : null}
            </View>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Label first>Where You Work</Label>
            <Note tight>Enter your postal code and we’ll tick the closest area — then add any others you’ll travel to.</Note>
            <Field label="Your postal code (optional)" value={postalCode} onChangeText={(v) => onPostal(v.toUpperCase())}
              autoComplete="postal-code" textContentType="postalCode" autoCapitalize="characters" autoCorrect={false} maxLength={7} placeholder="e.g. T2P 1J9" />
            {zoneHint.length > 0 ? <Note>{`✓ Added ${zoneHint.join(" and ")} from your postal code — tap any others below.`}</Note> : null}
            <View style={{ marginTop: t.s4 }}>
              <Chips>{AREAS.map((z) => <Chip key={z} label={z} on={selectedArea.includes(z)} onPress={() => toggleArea(z)} />)}</Chips>
            </View>
            <ErrorText>{errors.area}</ErrorText>
            {selectedArea.length > 0 ? <Note>{`✓ ${selectedArea.length} area${selectedArea.length > 1 ? "s" : ""} selected`}</Note> : null}
            <Note>Jobs outside your areas still reach you — they just sit lower in your list.</Note>

            <View style={{ marginTop: t.s6, paddingTop: t.s5, borderTopWidth: t.hairW, borderTopColor: rgba(t.fg, 0.08) }}>
              <Label first>When You Work</Label>
              <Note tight>Which days do you usually work? You can fine-tune this anytime from your dashboard.</Note>
              <View style={{ marginTop: t.s3 }}>
                <Chips>
                  <Chip label="Weekdays" on={isWeekdays} onPress={() => setDays([...WEEKDAYS])} />
                  <Chip label="Every day" on={isEvery} onPress={() => setDays([...AVAIL_DAYS])} />
                </Chips>
              </View>
              <Label>Tap the days you’re available</Label>
              <Chips>{AVAIL_DAYS.map((d) => <Chip key={d} label={d.slice(0, 3)} a11y={d} on={availDays.includes(d)} onPress={() => toggleDay(d)} />)}</Chips>
              {availDays.length > 0 ? (
                <>
                  <Label>What hours on those days?</Label>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: t.s3 }}>
                    <TimeSelect label="Start time" value={availStart} onChange={(v) => { setAvailStart(v); setErrors((e) => ({ ...e, avail: "" })); }} />
                    <Txt color={rgba(t.muted, 0.6)}>to</Txt>
                    <TimeSelect label="End time" value={availEnd} onChange={(v) => { setAvailEnd(v); setErrors((e) => ({ ...e, avail: "" })); }} />
                  </View>
                </>
              ) : null}
              <ErrorText>{errors.avail}</ErrorText>
            </View>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Note tight>
              {wt && wt.licence === "none"
                ? "Your work isn't a licensed trade, so a licence isn't required. Let clients know if you carry insurance — it's optional here, but it builds trust."
                : "Let clients know what you bring to the table. You can update any of this later from your dashboard."}
            </Note>
            <Tick checked={form.licensed} onChange={(v) => setFB("licensed", v)} label="I'm a licensed contractor">
              <Txt size={0.9}>I’m a licensed contractor</Txt>
            </Tick>
            {form.licensed ? <Field label="License number" value={form.licenseNumber} onChangeText={(v) => setF("licenseNumber", v)} /> : null}
            <Tick checked={form.hasInsurance} onChange={(v) => setFB("hasInsurance", v)} label="I carry liability insurance">
              <Txt size={0.9}>I carry liability insurance</Txt>
            </Tick>
            {form.hasInsurance ? (
              <>
                <View style={{ flexDirection: "row", gap: t.s3 }}>
                  <View style={{ flex: 1, minWidth: 0 }}><Field label="Insurance provider" value={form.insuranceProvider} onChangeText={(v) => setF("insuranceProvider", v)} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}><Field label="Expiry" value={form.insuranceExpiry} onChangeText={(v) => setF("insuranceExpiry", v)} placeholder="e.g. 2026-12" /></View>
                </View>
                <View style={{ marginTop: t.s3 }}>
                  <DocSlot label="insurance certificate" asset={docFiles.insurance} onPick={pickDoc("insurance")} onRemove={dropDoc("insurance")}
                    onError={setSubmitError} maxBytes={DOC_MAX_BYTES} tooBig={DOC_TOO_BIG} />
                  <Note tight>Optional here — you can also add it later on the Documents step. Certificate showing min. $1M coverage in Alberta.</Note>
                </View>
              </>
            ) : null}
            <Tick checked={form.operatesAlone} onChange={(v) => setForm((f) => ({ ...f, operatesAlone: v, hasWcb: v ? false : f.hasWcb }))}
              label="I operate alone (no employees), WCB not required">
              <Txt size={0.9}>I operate alone (no employees) — WCB not required</Txt>
            </Tick>
            {form.operatesAlone ? (
              <Note>Solo operators with no workers are exempt from WCB in Alberta. You’ll still need your licence (if your trade requires one) and liability insurance.</Note>
            ) : (
              <Tick checked={form.hasWcb} onChange={(v) => setFB("hasWcb", v)} label="I have WCB / WorkSafe coverage">
                <Txt size={0.9}>I have WCB / WorkSafe coverage</Txt>
              </Tick>
            )}
            <Field label="References or past-work links (optional)" multiline value={form.workReferences} onChangeText={(v) => setF("workReferences", v)}
              placeholder="Links to past work, or names/numbers of references" />
          </>
        ) : null}

        {step === 5 ? (
          <>
            <Label first aside="(optional)">Profile Photo</Label>
            <AvatarPicker asset={photo} onPick={(a) => { setSubmitError(""); setPhoto(a); }} onRemove={() => setPhoto(null)} onError={setSubmitError}
              maxBytes={AVATAR_MAX_BYTES} tooBig={AVATAR_TOO_BIG} />

            <Label>Verification Documents</Label>
            <Note tight>Snap a photo or upload now — or skip this and add them later from your dashboard. You’ll need them verified before you can take jobs, but they won’t hold up your signup.</Note>
            {docs.map((doc) => (
              <View key={doc.key} style={{ marginTop: t.s5 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: t.s2, flexWrap: "wrap" }}>
                  <Txt variant="label" size={0.8} color={rgba(t.muted, 0.75)}>{doc.label.toUpperCase()}</Txt>
                  {/* Neutral, not orange: the screen's one orange thing is the Complete button. */}
                  <Txt size={0.72} color={doc.required ? t.text : rgba(t.muted, 0.45)}>{doc.required ? "Needed before approval" : "Optional"}</Txt>
                </View>
                <Note tight>{doc.hint}</Note>
                <View style={{ marginTop: t.s2 }}>
                  <DocSlot label={doc.label} asset={docFiles[doc.key]} onPick={pickDoc(doc.key)} onRemove={dropDoc(doc.key)}
                    onError={setSubmitError} maxBytes={DOC_MAX_BYTES} tooBig={DOC_TOO_BIG} />
                </View>
              </View>
            ))}
            <InfoBox icon="eye-off">Documents are stored securely and only used for verification. They are never shared with clients.</InfoBox>
            <TermsTick adult checked={agreedToTerms} onChange={(v) => { setAgreedToTerms(v); if (v) setSubmitError(""); }}
              after="I confirm that I hold all licences, permits, and insurance required to perform the services I offer in Alberta." />
            <Tick checked={newsletterOptIn} onChange={setNewsletterOptIn} label="Email me practical tips on winning more jobs on Freddy Fix It">
              <Txt size={0.82} lh={1.6} color={rgba(t.muted, 0.75)}>Email me practical tips on winning more jobs on Freddy Fix It (about once a week — unsubscribe anytime).</Txt>
            </Tick>
          </>
        ) : null}

        {hasErrors ? <ErrorText>Please check the highlighted answers above.</ErrorText> : null}
        {submitError ? <FormNote>{submitError}</FormNote> : null}
        {refused ? <LinkButton onPress={() => router.replace("/")}>Go to the account you have →</LinkButton> : null}
      </FormCard>

      <FormNav backLabel="← Back" onBack={back} busy={loading}
        nextLabel={step < TOTAL ? "Next →" : loading ? "Uploading your details…" : "Complete Registration →"}
        onNext={step < TOTAL ? next : () => void handleSubmit()} />

      {!authedUserId ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: t.s2, marginTop: t.s4 }}>
          <Txt size={0.82} color={rgba(t.muted, 0.55)}>Already have an account?</Txt>
          <LinkButton onPress={() => router.replace("/sign-in")}>Sign in</LinkButton>
        </View>
      ) : null}
    </Screen>
  );
}

function InfoBox({ children, icon = "info" }: { children: string; icon?: "info" | "eye-off" }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: t.s3, marginTop: t.s4, padding: t.s4, borderRadius: t.r2, backgroundColor: rgba(t.fg, 0.04), borderWidth: t.hairW, borderColor: rgba(t.fg, 0.1) }}>
      <Ic name={icon} size={ui.icon.md} color={rgba(t.muted, 0.7)} />
      <Txt size={0.82} lh={1.6} color={rgba(t.muted, 0.75)} style={{ flex: 1, minWidth: 0 }}>{children}</Txt>
    </View>
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
