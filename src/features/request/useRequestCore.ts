// The state both request forms share: what's broken, which trade, the follow-up
// answers, when, the approximate location and the recurring cadence. ONE copy,
// because web's two forms (NewRequest + ClientOnboarding) hold identical copies of
// this and they have drifted before (the photo wording, PhotoPicker.tsx).
//
// Each form seeds it from its own draft. The two drafts name two fields
// differently (web: `description`/`schedule` vs `jobDescription`/`preferredSchedule`),
// so the keys are passed in and the snapshot uses them: a draft written by this hook
// reads back exactly as the web shape for that form.
import { useState } from "react";
import { useServicePricing, floorFor } from "@/lib/servicePricing";
import { detectFromText } from "@/lib/serviceTags";
import { questionsFor, type JobAnswers, type JobQuestion } from "@/lib/jobQuestions";
import { areasFromPostal, fsaOf } from "@/lib/calgaryAreas";
import { SLIDER_STOPS } from "@/lib/recurrence";
import { dArr, dBool, dNum, dStr } from "@/lib/requestDraft";
import { SERVICES, composedPart, seasonRange, SEASON_PRESETS } from "./webPage";

type Draft = Record<string, unknown> | null;
export type CoreKeys = { description: "description" | "jobDescription"; schedule: "schedule" | "preferredSchedule" };

function restoreAnswers(draft: Draft): JobAnswers {
  // Free-form id->string map: keep only the string values (web, both forms).
  const raw = draft?.answers;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: JobAnswers = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
  return out;
}

export function useRequestCore(draft: Draft, keys: CoreKeys, opts: { addService?: string | null; recurringDefault?: boolean } = {}) {
  const [selectedServices, setSelectedServices] = useState<string[]>(() => {
    const restored = dArr(draft, "selectedServices").filter(l => SERVICES.some(sv => sv.label === l));
    const add = opts.addService;
    return add && !restored.includes(add) ? [...restored, add] : restored; // ADD, never replace
  });
  const pricing = useServicePricing();
  const [tags, setTags] = useState<string[]>(() => dArr(draft, "tags"));
  const [answers, setAnswers] = useState<JobAnswers>(() => restoreAnswers(draft));
  const [detectedFor, setDetectedFor] = useState(() => dStr(draft, "detectedFor"));
  const [showAllServices, setShowAllServices] = useState(() => dBool(draft, "showAllServices"));
  const [description, setDescription] = useState(() => dStr(draft, keys.description));
  const [schedule, setScheduleRaw] = useState(() => dStr(draft, keys.schedule));

  // APPROXIMATE location only: a postal code plus an area, never a street address.
  // The area is DERIVED from the postal code; the chips are the escape hatch.
  const [postalCode, setPostalCode] = useState(() => dStr(draft, "postalCode"));
  const [area, setArea] = useState(() => dStr(draft, "area"));
  const [areaOverride, setAreaOverride] = useState(() => {
    const a = dStr(draft, "area");
    return !!a && a !== (areasFromPostal(dStr(draft, "postalCode"))[0] || "");
  });

  const [recurring, setRecurring] = useState(() => opts.recurringDefault ?? dBool(draft, "recurring"));
  const [sliderIdx, setSliderIdx] = useState(() => dNum(draft, "sliderIdx", 3, 0, SLIDER_STOPS.length - 1));
  // Web seeds a cadence in an effect when the schedule becomes Recurring. Here the
  // seed happens where the schedule is set, and on restore below, with the same result.
  const [recurringFrequency, setRecurringFrequency] = useState<string>(() => {
    const f = dStr(draft, "recurringFrequency");
    if (f) return f;
    return dStr(draft, keys.schedule) === "Recurring" ? SLIDER_STOPS[dNum(draft, "sliderIdx", 3, 0, SLIDER_STOPS.length - 1)] : "";
  });
  const [recurringDates, setRecurringDates] = useState<string[]>(() => dArr(draft, "recurringDates"));
  const [recurringKm, setRecurringKm] = useState(() => dStr(draft, "recurringKm"));
  // Only 0 / 2 / 3 are offerable; anything else restores as 0 (web).
  const [prepayPref, setPrepayPref] = useState(() => { const n = dNum(draft, "prepayPref", 0, 0, 3); return n === 2 || n === 3 ? n : 0; });
  const [recurringStartDate, setRecurringStartDate] = useState(() => dStr(draft, "recurringStartDate"));
  const [recurringEndDate, setRecurringEndDate] = useState(() => dStr(draft, "recurringEndDate"));

  const primaryService = selectedServices[0] || "";
  const activeQuestions: JobQuestion[] = questionsFor(primaryService);
  /** The platform starting price for the selection: written to budget_min, never shown as a quote. */
  const budgetFloor = floorFor(selectedServices.join(", "), pricing);
  const derivedArea = areasFromPostal(postalCode)[0] || "";
  const showAreaChips = areaOverride || (!!fsaOf(postalCode) && !derivedArea);

  /** The answers belong to the FIRST service's question set; a new first service drops them (web). */
  const applyServices = (next: string[]) => {
    if ((next[0] || "") !== primaryService) setAnswers({});
    setSelectedServices(next);
  };
  const toggleService = (label: string) =>
    applyServices(selectedServices.includes(label) ? selectedServices.filter(x => x !== label) : [...selectedServices, label]);
  const removeTag = (t: string) => setTags(prev => prev.filter(x => x !== t));

  const setAnswer = (q: { id: string; multi?: boolean }, option: string) => {
    setAnswers(prev => {
      if (!q.multi) return prev[q.id] === option ? { ...prev, [q.id]: "" } : { ...prev, [q.id]: option }; // tap again clears
      const cur = Array.isArray(prev[q.id]) ? (prev[q.id] as string[]) : [];
      return { ...prev, [q.id]: cur.includes(option) ? cur.filter(v => v !== option) : [...cur, option] };
    });
  };
  const isAnswered = (q: { id: string }, option: string) => {
    const v = answers[q.id];
    return Array.isArray(v) ? v.includes(option) : v === option;
  };
  const answeredCount = activeQuestions.filter(q => { const v = answers[q.id]; return Array.isArray(v) ? v.length > 0 : !!v; }).length;

  /**
   * Read the description and pre-fill services + tags, on the way out of the
   * describe screen (never per keystroke, never over services already picked).
   * Returns what it found: callers must use the RETURN value, not state (web).
   */
  const runDetect = (): { tags: string[]; services: string[] } => {
    const text = description.trim();
    if (!text || text === detectedFor) return { tags, services: selectedServices };
    const d = detectFromText(text);
    setDetectedFor(text);
    setTags(d.tags);
    const services = selectedServices.length ? selectedServices : d.services;
    if (d.services.length && !selectedServices.length) applyServices(d.services);
    return { tags: d.tags, services };
  };

  const composed = (text: string, withExtras: boolean) => composedPart(text, withExtras, primaryService, answers, tags);

  /** The postal code OWNS the area while the chips are hidden, including clearing it (web). */
  const onPostal = (v: string) => {
    setPostalCode(v);
    if (!areaOverride) setArea(areasFromPostal(v)[0] || "");
  };

  const setSchedule = (label: string) => {
    setScheduleRaw(label);
    if (label === "Recurring" && !recurringFrequency) setRecurringFrequency(SLIDER_STOPS[sliderIdx]);
  };
  const pickSlider = (i: number) => {
    const idx = Math.max(0, Math.min(SLIDER_STOPS.length - 1, i));
    setSliderIdx(idx);
    setRecurringFrequency(SLIDER_STOPS[idx]);
  };
  const applySeason = (sp: typeof SEASON_PRESETS[0]) => {
    const r = seasonRange(sp);
    setRecurringStartDate(r.start);
    setRecurringEndDate(r.end);
  };
  const addDate = (d: string) => setRecurringDates(prev => (prev.includes(d) ? prev : [...prev, d].sort()));
  const removeDate = (d: string) => setRecurringDates(prev => prev.filter(x => x !== d));

  /** The draft fields this hook owns, under the form's own key names. */
  const snapshot = () => ({
    tags, answers, detectedFor, showAllServices, selectedServices,
    [keys.description]: description, [keys.schedule]: schedule,
    postalCode, area,
    recurring, recurringFrequency, sliderIdx, recurringDates,
    recurringKm, prepayPref, recurringStartDate, recurringEndDate,
  });

  return {
    selectedServices, applyServices, toggleService, pricing, budgetFloor, primaryService,
    tags, removeTag, answers, setAnswer, isAnswered, answeredCount, activeQuestions,
    showAllServices, setShowAllServices, runDetect, composed,
    description, setDescription, schedule, setSchedule,
    postalCode, onPostal, area, setArea, areaOverride, setAreaOverride, derivedArea, showAreaChips,
    recurring, setRecurring, recurringFrequency, setRecurringFrequency, sliderIdx, pickSlider,
    recurringDates, addDate, removeDate, recurringKm, setRecurringKm, prepayPref, setPrepayPref,
    recurringStartDate, setRecurringStartDate, recurringEndDate, setRecurringEndDate, applySeason,
    snapshot,
  };
}

export type RequestCore = ReturnType<typeof useRequestCore>;
