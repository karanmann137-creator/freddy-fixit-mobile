// New request, signed in (PLAN step 4.3). Port of web components/NewRequest.tsx:
// describe → confirm → questions → where & when, then ONE insert into
// client_requests with the same columns web writes. The pieces are shared with
// the signup funnel (features/request), so the two forms can't drift.
//
// Rules carried over from web, each with a reason in NewRequest.tsx:
//   * Three-outcome reads. A failed load is a DeadEnd with retry, never a blank form
//     that later posts half a request.
//   * APPROXIMATE location only (postal code + area token via formatApproxLocation).
//     "Same as last time" only when BOTH halves of the last location parse.
//   * The description is sent as typed (plus the answers/tags web folds in). It is
//     never rewritten; tidyDescription is a display-time tidy (web JobDescription).
//   * Multi-trade split: asked BEFORE the photo upload (the upload isn't idempotent);
//     never with a preferred pro or a vehicle; ONE multi-row insert, never a loop.
//   * A photo is nudged once, never required.
//   * Every failure shows the server's reason and keeps the form (and its draft) filled.
//   * Success: draft cleared (autosave already off), client data reloaded, back to Requests.
//
// Route params (rehire from the Pros tab, web ?pro=&service=):
//   pro      → preferred_contractor_id (the client can clear it: "Send to everyone instead")
//   service  → ADDED to the restored services, never replacing them
import React, { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { Button, DeadEnd, Field, FormNote, Ic, Screen, ScreenHeader, SkRow, Txt, rgba, ui, useDelayed, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { readAuthUser } from "@/lib/authRead";
import { acceptTerms } from "@/lib/terms";
import { trackEvent } from "@/lib/analytics";
import { detectJobSplit, type SplitPart } from "@/lib/jobSplit";
import { floorFor } from "@/lib/servicePricing";
import { formatApproxLocation, isPostalCode } from "@/lib/calgaryAreas";
import { isPerKmService } from "@/lib/recurrence";
import { acceptingRequests, usePlatformStatus } from "@/lib/platformStatus";
import { fmtPhone, validatePhone } from "@/lib/emailValidation";
import { NEWREQUEST_DRAFT_KEY, clearDraft, dArr, dNum, dStr, useDraftAutosave, useStoredDraft } from "@/lib/requestDraft";
import type { UploadAsset } from "@/lib/imageCompress";
import { uploadImage } from "@/platform/upload";
import { useRequestCore } from "@/features/request/useRequestCore";
import { lastApprox, serviceFromParam } from "@/features/request/webPage";
import {
  BudgetNote, ChoiceRow, DraftBanner, ErrorText, FormCard, FormNav, Label, LinkButton, LocationBlock, Note, PhotoNudge,
  PhotoPicker, QuestionsBlock, ScheduleBlock, ServiceConfirm, SplitSheet, StepProgress, StepTitle, TermsTick, Tick, recurringDateError,
} from "@/features/request/pieces";
import { WaitlistCard } from "@/features/request/Waitlist";
import { useClientData } from "./data";

const TOTAL = 4;
const STEP_TITLES = ["What Needs Fixing?", "Did We Get That Right?", "A Few Quick Questions", "Where & When"];
const STEP_NAMES = ["describe", "confirm", "questions", "details"]; // analytics names: do not rename (web)

type Ctx = { userId: string; email: string | null; profile: any | null; lastReq: any | null; vehicles: any[] };
type Load = { kind: "loading" } | { kind: "error" } | { kind: "ok"; ctx: Ctx };

/** web NewRequest's mount read. Each result is checked: a failed vehicles read is not "no vehicles". */
async function loadCtx(): Promise<Load | "signedOut"> {
  try {
    const who = await readAuthUser();
    if (who.kind === "signedOut") return "signedOut";
    if (who.kind !== "user") return { kind: "error" };
    const [p, r, v] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", who.userId).maybeSingle(),
      supabase.from("client_requests").select("*").eq("user_id", who.userId).order("created_at", { ascending: false }).limit(1),
      supabase.from("saved_vehicles").select("*").eq("user_id", who.userId).order("created_at", { ascending: false }),
    ]);
    if (p.error || r.error || v.error) return { kind: "error" };
    return { kind: "ok", ctx: { userId: who.userId, email: who.email ?? null, profile: p.data, lastReq: (r.data ?? [])[0] ?? null, vehicles: v.data ?? [] } };
  } catch {
    return { kind: "error" };
  }
}

export function NewRequestScreen() {
  const { t } = useTheme();
  const params = useLocalSearchParams<{ pro?: string; service?: string }>();
  const stored = useStoredDraft(NEWREQUEST_DRAFT_KEY);
  const { status: platform, ready: platformReady } = usePlatformStatus();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [tick, setTick] = useState(0);
  const [gen, setGen] = useState(0); // "Start over" remounts the form blank (web reloads the page)
  const showSkeleton = useDelayed();

  useEffect(() => {
    let alive = true;
    void loadCtx().then((r) => {
      if (!alive) return;
      if (r === "signedOut") { router.replace("/"); return; }
      setLoad(r);
    });
    return () => { alive = false; };
  }, [tick]);

  if (load.kind === "error") {
    // Retry re-runs the reads in place; the draft is untouched, so nothing typed is lost.
    return <DeadEnd msg="We couldn't load your details. Check your connection and try again." retryLabel="Try again"
      onRetry={() => { setLoad({ kind: "loading" }); setTick((n) => n + 1); }} />;
  }
  if (load.kind === "loading" || !stored.ready) {
    return (
      <Screen>
        <ScreenHeader title="New request" />
        {showSkeleton ? <View style={{ paddingTop: t.s4, gap: t.s4 }}><SkRow /><SkRow /><SkRow /></View> : null}
      </Screen>
    );
  }
  // Waitlist / paused: the DB trigger enforce_platform_pause is the real gate; this is the humane version.
  if (platformReady && !acceptingRequests(platform.mode)) {
    const d = stored.draft;
    return (
      <Screen>
        <ScreenHeader title="New request" />
        <WaitlistCard source="new_request" initialService={dArr(d, "selectedServices")[0] || ""} initialDescription={dStr(d, "description")}
          initialEmail={load.ctx.profile?.email || ""} initialName={load.ctx.profile?.first_name || ""} />
        <Note>Any job already in progress carries on as normal — you’ll find it on your Requests tab.</Note>
      </Screen>
    );
  }
  return (
    <NewRequestForm key={gen} ctx={load.ctx} draft={gen ? null : stored.draft} restored={gen === 0 && stored.restored}
      onStartOver={() => { stored.startOver(); setGen((g) => g + 1); }}
      proParam={typeof params.pro === "string" && params.pro ? params.pro : null}
      serviceParam={gen ? null : (typeof params.service === "string" ? params.service : null)} />
  );
}

function NewRequestForm({ ctx, draft, restored, onStartOver, proParam, serviceParam }: {
  ctx: Ctx; draft: Record<string, unknown> | null; restored: boolean; onStartOver: () => void; proParam: string | null; serviceParam: string | null;
}) {
  const { t } = useTheme();
  const { state, reload } = useClientData();
  const { profile, lastReq, vehicles } = ctx;
  const isBusiness = lastReq?.client_type === "business";
  const prev = lastApprox(lastReq?.location);

  const core = useRequestCore(draft, { description: "description", schedule: "schedule" }, {
    addService: serviceFromParam(serviceParam),
    // web: a business client's last request decides the recurring default (it overrides a draft).
    recurringDefault: isBusiness ? !!lastReq?.recurring : undefined,
  });
  const [step, setStep] = useState(() => dNum(draft, "step", 1, 1, TOTAL));
  // DEFAULT, not override: a restored choice stands (web).
  const [locChoice, setLocChoice] = useState<string>(() => dStr(draft, "locChoice") || (prev.text ? "last" : "new"));
  const [vehChoice, setVehChoice] = useState<string>(() => dStr(draft, "vehChoice") || (vehicles[0]?.id ?? "new"));
  const [vehYear, setVehYear] = useState(() => dStr(draft, "vehYear"));
  const [vehMake, setVehMake] = useState(() => dStr(draft, "vehMake"));
  const [vehModel, setVehModel] = useState(() => dStr(draft, "vehModel"));
  const [saveNewVehicle, setSaveNewVehicle] = useState(true);
  const [phone, setPhone] = useState(""); // only asked when the profile has none
  const [preferredPro, setPreferredPro] = useState<string | null>(proParam);
  const [photo, setPhoto] = useState<UploadAsset | null>(null);
  const [nudged, setNudged] = useState(false); // the photo nudge: once, then Next goes through
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false); // never restored: consent is an act of this visit
  const [splitSuggestion, setSplitSuggestion] = useState<SplitPart[] | null>(null);

  const pros: any[] = state.kind === "ok" ? state.data.pros : []; // a convenience strip: a failed read just hides it (web)
  const chosenPro = preferredPro ? pros.find((p) => p.contractor_id === preferredPro) : null;
  const isVehicle = core.selectedServices.some(isPerKmService); // the same four vehicle services as web's VEHICLE_SERVICES
  // ONE answer to "entering a fresh location?" for renderer, validate and submit (web).
  const enteringNew = locChoice === "new" || !prev.text;
  const clearErr = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));

  // Photo, errors, busy flags and the terms tick are never saved (requestDraft header).
  useDraftAutosave(NEWREQUEST_DRAFT_KEY, { step, ...core.snapshot(), locChoice, vehChoice, vehYear, vehMake, vehModel }, !submitting && !done);

  useEffect(() => { trackEvent("onboarding_step_view", { flow: "returning_client", step, step_name: STEP_NAMES[step - 1] }); }, [step]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (step === 1) {
      if (core.description.trim().length < 10) e.description = "Please add a few more details (min 10 characters)";
      if (!profile?.phone) { const pv = validatePhone(phone, true); if (!pv.ok) e.phone = pv.error!; }
    }
    if (step === 2) {
      if (core.selectedServices.length === 0) e.services = "Please select at least one service";
    }
    if (step === 4) {
      if (!core.schedule) e.schedule = "Please choose a timeframe";
      const dErr = recurringDateError(core);
      if (dErr) e.schedule = dErr;
      if (!enteringNew) { if (!prev.text) e.location = "Please tell us where this job is"; }
      else if (!isPostalCode(core.postalCode)) e.location = "Please enter a full postal code (e.g. T3A 1B2)";
      else if (!core.area) e.location = "Please choose the area this job is in";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate()) return;
    if (step === 1 && !photo && !nudged) { setNudged(true); return; } // a nudge, NOT a gate
    if (step === 1) core.runDetect();
    setStep((s) => s + 1);
  };
  const back = () => {
    if (step === 1) { if (router.canGoBack()) router.back(); else router.replace("/client"); }
    else setStep((s) => s - 1);
  };

  /** `split`: undefined = first press (run the detector) · "one" = keep as one · parts = accepted split. */
  const submit = async (split?: SplitPart[] | "one") => {
    if (submitting) return;
    if (!validate()) return;
    if (!agreedToTerms) { setSubmitError("Please agree to the User Agreement and Privacy Policy to continue."); return; }
    setSubmitting(true); setSubmitError("");
    try {
      const who = await readAuthUser();
      if (who.kind === "signedOut") { setSubmitting(false); router.replace("/"); return; }
      if (who.kind !== "user") {
        setSubmitError("We couldn't confirm you're still signed in. Your answers are saved — check your connection and submit again.");
        setSubmitting(false);
        return;
      }
      const uid = who.userId;

      if (split === undefined && !preferredPro && !isVehicle) {
        const suggestion = await detectJobSplit(core.description); // never throws; null = post unsplit
        if (suggestion && suggestion.length >= 2) { setSplitSuggestion(suggestion); setSubmitting(false); return; }
      }
      const splitParts = Array.isArray(split) ? split : null;

      let photoPath: string | null = null;
      if (photo) {
        const up = await uploadImage({ bucket: "problem-photos", basePath: `${uid}/${Crypto.randomUUID()}`, asset: photo, profile: "photo" });
        if (!up.ok) {
          if (up.blocked) {
            // web: drop the refused photo FIRST, so pressing Submit again just works.
            setPhoto(null);
            setSubmitError(up.message + " We've removed it — press Submit again to post without a photo, or choose a different one.");
          } else {
            // App: say so and keep the photo (web posts without it silently). Nothing is posted yet.
            setSubmitError(up.message + " Nothing has been posted yet: press Submit to try again, or remove the photo to post without it.");
          }
          setSubmitting(false);
          return;
        }
        photoPath = up.path;
      }

      const location = enteringNew ? formatApproxLocation(core.postalCode, core.area) : prev.text;

      let vehicleDetails: any = null;
      if (isVehicle) {
        if (vehChoice !== "new") {
          const v = vehicles.find((x) => x.id === vehChoice);
          if (v) vehicleDetails = { year: v.year ?? "", make: v.make ?? "", model: v.model ?? "", notes: v.notes ?? "" };
        } else if (vehYear.trim() || vehMake.trim() || vehModel.trim()) {
          vehicleDetails = { year: vehYear.trim(), make: vehMake.trim(), model: vehModel.trim() };
          if (saveNewVehicle) {
            await supabase.from("saved_vehicles").insert({ user_id: uid, year: vehYear.trim() || null, make: vehMake.trim() || null, model: vehModel.trim() || null });
          }
        }
      }

      // Everything every part of a split SHARES (web `base`).
      const base = {
        user_id: uid,
        first_name: profile?.first_name ?? null,
        last_name: profile?.last_name ?? null,
        email: profile?.email ?? who.email ?? null,
        phone: profile?.phone ?? (phone.trim() || null),
        preferred_contractor_id: preferredPro,
        preferred_schedule: core.schedule,
        location,
        photo_path: photoPath,
        status: "pending",
        budget_flexible: false, // the client never said they're flexible (web)
        budget_min: core.budgetFloor, // OURS: the platform floor for the work, not a client figure
        budget_max: null,
        client_type: lastReq?.client_type ?? "individual",
        business_name: isBusiness ? (lastReq?.business_name ?? null) : null,
        business_type: isBusiness ? (lastReq?.business_type ?? null) : null,
        locations: isBusiness ? (lastReq?.locations ?? null) : null,
        recurring: core.recurring || core.schedule === "Recurring",
        recurring_frequency: core.recurringFrequency || null,
        recurring_interval_km: core.recurringFrequency === "per_km" && core.recurringKm ? (parseInt(core.recurringKm, 10) || null) : null,
        recurring_prepay_pref: core.prepayPref || 0,
        recurring_start_date: core.recurringStartDate || null,
        recurring_end_date: core.recurringEndDate || null,
        recurring_dates: core.recurringDates.length ? core.recurringDates : null,
        billing_preference: isBusiness ? (lastReq?.billing_preference ?? null) : null,
        vehicle_details: vehicleDetails,
      };
      // The answers/tags ride on the part whose service they were asked about, else part 1 (web).
      const extrasOn = splitParts ? Math.max(0, splitParts.findIndex((p) => p.service === core.primaryService)) : 0;
      const rows = splitParts
        ? splitParts.map((p, i) => ({
            ...base,
            service_needed: p.service,
            job_description: core.composed(p.description, i === extrasOn),
            budget_min: floorFor(p.service, core.pricing),
            preferred_contractor_id: null,
          }))
        : [{ ...base, service_needed: core.selectedServices.join(", "), job_description: core.composed(core.description, true) }];

      // ONE insert carrying N rows: a split lands whole or not at all (dispatch is permanent).
      const { error } = await supabase.from("client_requests").insert(rows);
      if (error) throw error;

      // This form's own tick IS the acceptance: record it, fire and forget (the gate catches a failed write).
      acceptTerms("new-request").catch(() => { /* covered by the terms gate */ });
      trackEvent("post_job", { flow: "returning_client" });
      setDone(true); // autosave stays off for good
      await clearDraft(NEWREQUEST_DRAFT_KEY);
      await reload();
      router.dismissTo("/client");
    } catch (err) {
      setSubmitError((err as { message?: string })?.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const hasErrors = Object.values(errors).some(Boolean);

  return (
    // Keyed on the step: a new step starts at the top of the page (web scrollTo(0,0)).
    <Screen key={step}>
      <ScreenHeader title="New request" onBack={back} />
      <StepProgress step={step} total={TOTAL} />
      {restored ? <DraftBanner onStartOver={onStartOver} /> : null}
      <StepTitle>{STEP_TITLES[step - 1]}</StepTitle>

      {preferredPro ? (
        <View style={{ marginBottom: t.s4, padding: t.s4, gap: t.s2, borderRadius: t.r3, borderWidth: ui.line, borderColor: rgba(t.accentRgb, 0.4), backgroundColor: rgba(t.accentRgb, 0.07) }}>
          <View style={{ flexDirection: "row", gap: t.s2 }}>
            <Ic name="star" size={ui.icon.md} color={t.accent500} />
            <Txt size={0.86} lh={1.5} style={{ flex: 1 }}>
              {chosenPro
                ? "This request goes to " + (chosenPro.company_name || chosenPro.name || "your pro") + " first — they'll be notified directly to send you an estimate."
                : "You're rebooking a pro you've worked with — they'll be notified directly to send you an estimate."}
            </Txt>
          </View>
          {/* A reservation hides the request from every other pro for 48 hours: the client can undo it before posting. */}
          <LinkButton onPress={() => setPreferredPro(null)}>Send to everyone instead</LinkButton>
        </View>
      ) : null}

      <FormCard>
        {step === 1 ? (
          <>
            <View style={{ paddingBottom: t.s4, marginBottom: t.s2, borderBottomWidth: t.hairW, borderBottomColor: rgba(t.fg, 0.08) }}>
              <Label first>Submitting as</Label>
              <Txt variant="bodyMedium" size={0.95}>
                {[profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Your account"}
                {isBusiness && lastReq?.business_name ? <Txt size={0.95} color={rgba(t.muted, 0.6)}>{" · " + lastReq.business_name}</Txt> : null}
              </Txt>
              <Txt size={0.82} color={rgba(t.muted, 0.55)} style={{ marginTop: t.s1 }}>{[profile?.email, profile?.phone].filter(Boolean).join(" · ")}</Txt>
              {!profile?.phone ? (
                <Field label="Phone (so we can text you when estimates arrive)" value={phone} keyboardType="phone-pad" autoComplete="tel"
                  textContentType="telephoneNumber" placeholder="403-555-0100" error={errors.phone || null}
                  onChangeText={(v) => { setPhone(fmtPhone(v)); clearErr("phone"); }} />
              ) : null}
              <Note>Need to change your name or phone? Update it in your profile.</Note>
            </View>

            {pros.length > 0 && !preferredPro ? (
              <View style={{ paddingBottom: t.s4, marginBottom: t.s2, borderBottomWidth: t.hairW, borderBottomColor: rgba(t.fg, 0.08) }}>
                <Label>Used us before?</Label>
                <Note tight>Send this straight to a pro you’ve worked with. They get first refusal for 48 hours — no need to compare estimates again.</Note>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.s3, paddingTop: t.s3 }}>
                  {pros.slice(0, 6).map((pro) => (
                    <View key={pro.contractor_id} style={{ width: ui.readMax / 2, padding: t.s3, borderRadius: t.r2, borderWidth: t.hairW, borderColor: rgba(t.fg, 0.1), backgroundColor: rgba(t.fg, 0.03) }}>
                      <Txt variant="bodyBold" size={0.88} numberOfLines={1}>{pro.company_name || pro.name || "Your pro"}</Txt>
                      <Txt size={0.72} color={rgba(t.muted, 0.55)} numberOfLines={1} style={{ marginTop: ui.nudge2 }}>
                        {(pro.rating ? "★ " + Number(pro.rating).toFixed(1) : "New") + (pro.last_service ? " · " + pro.last_service : "")}
                      </Txt>
                      {/* Sets state rather than navigating: everything typed so far stays (web). */}
                      <View style={{ marginTop: t.s2 }}><Button full onPress={() => setPreferredPro(pro.contractor_id)}>Book again</Button></View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <Field label="What’s going on?" multiline value={core.description} error={errors.description || null}
              placeholder="e.g. The kitchen tap drips constantly and the cupboard underneath is damp — it's been getting worse for a couple of weeks."
              onChangeText={(v) => { core.setDescription(v); clearErr("description"); }} />

            <Label aside={nudged && !photo ? "*" : "(optional)"}>Photo of the problem</Label>
            <Note tight>A clear photo helps contractors give you a faster, more accurate estimate — and means fewer surprises on the day.</Note>
            <View style={{ marginTop: t.s3 }}>
              <PhotoPicker asset={photo} onPick={(a) => { setSubmitError(""); setPhoto(a); }} onRemove={() => setPhoto(null)} onError={setSubmitError} />
            </View>
            {nudged && !photo ? <PhotoNudge /> : null}
          </>
        ) : null}

        {step === 2 ? (
          <ServiceConfirm core={core} error={errors.services} tagNote="These go to the pro with your description. Remove anything that isn’t right." />
        ) : null}

        {step === 3 ? (
          <QuestionsBlock core={core} />
        ) : null}

        {step === 4 ? (
          <>
            <ScheduleBlock core={core} error={errors.schedule} onPicked={() => clearErr("schedule")} />
            <LocationBlock core={core} error={errors.location} label="Where is this job?" onEdit={() => clearErr("location")}
              last={{ text: prev.text, choice: locChoice, setChoice: setLocChoice }} />

            {isVehicle ? (
              <>
                <Label>Which vehicle?</Label>
                {vehicles.map((v) => (
                  <ChoiceRow key={v.id} title={[v.year, v.make, v.model].filter(Boolean).join(" ") || "Saved vehicle"} on={vehChoice === v.id} onPress={() => setVehChoice(v.id)} />
                ))}
                <ChoiceRow title={vehicles.length ? "A different vehicle" : "Add your vehicle"} on={vehChoice === "new"} onPress={() => setVehChoice("new")} />
                {vehChoice === "new" ? (
                  <>
                    <View style={{ flexDirection: "row", gap: t.s2 }}>
                      <View style={{ flex: 1, minWidth: 0 }}><Field label="Year" value={vehYear} onChangeText={setVehYear} keyboardType="number-pad" /></View>
                      <View style={{ flex: 1, minWidth: 0 }}><Field label="Make" value={vehMake} onChangeText={setVehMake} /></View>
                      <View style={{ flex: 1, minWidth: 0 }}><Field label="Model" value={vehModel} onChangeText={setVehModel} /></View>
                    </View>
                    <Tick checked={saveNewVehicle} onChange={setSaveNewVehicle} label="Save this vehicle for next time">
                      <Txt size={0.85} color={rgba(t.muted, 0.75)}>Save this vehicle for next time</Txt>
                    </Tick>
                  </>
                ) : null}
              </>
            ) : null}

            {isBusiness ? (
              <Tick checked={core.recurring} onChange={core.setRecurring} label="This is recurring / scheduled maintenance">
                <Txt size={0.88}>This is recurring / scheduled maintenance</Txt>
              </Tick>
            ) : null}

            <BudgetNote services={core.selectedServices} pricing={core.pricing} />
            <TermsTick checked={agreedToTerms} onChange={(v) => { setAgreedToTerms(v); if (v) setSubmitError(""); }} />
          </>
        ) : null}

        {hasErrors ? <ErrorText>Please check the highlighted answers above.</ErrorText> : null}
        {submitError ? <FormNote>{submitError}</FormNote> : null}
      </FormCard>

      <FormNav backLabel={step === 1 ? "← Requests" : "← Back"} onBack={back} busy={submitting}
        nextLabel={step < TOTAL ? "Next →" : submitting ? "Submitting…" : "Submit Request →"}
        onNext={step < TOTAL ? next : () => void submit()} />

      <SplitSheet parts={splitSuggestion}
        onKeepOne={() => { setSplitSuggestion(null); void submit("one"); }}
        onSplit={(parts) => { setSplitSuggestion(null); void submit(parts); }} />
    </Screen>
  );
}
