// ⚠️ PORTED FROM WEB PAGE FILES, not from src/lib. Web prerequisite (report: "W5"):
// move each item below into a web src/lib module (e.g. src/lib/requestForm.ts),
// add it to the SHARED list, `npm run sync`, then delete this file and import the
// synced copy. Until then every line here is a byte-faithful copy of the web source
// named beside it, so both clients write the same rows. Change nothing here that
// isn't changed on web first.
//
//   SERVICES, SCHEDULES   pages/ClientOnboarding.tsx:35,74 (NewRequest imports them from there)
//   HOME_TO_SERVICE       pages/ClientOnboarding.tsx:131 (identical inline copy in components/NewRequest.tsx:317)
//   composedPart          components/NewRequest.tsx:502 / pages/ClientOnboarding.tsx:642 (identical)
//   namesFromEmail        pages/ClientOnboarding.tsx:155
//   SEASON_PRESETS/seasonRange  components/NewRequest.tsx:164 / pages/ClientOnboarding.tsx:439 (identical)
//   lastApprox            components/NewRequest.tsx:367 (prevApprox)
//   serviceFromParam      app-authored: the ?service= ADD-never-replace effect in both forms, as a function
//   PHOTO_MAX_BYTES/PHOTO_TOO_BIG  components/PhotoPicker.tsx (the 10 MB cap, checked before compression)
import type { IconName } from "@/kit";
import { answerSummary, type JobAnswers } from "@/lib/jobQuestions";
import { formatApproxLocation, parseApproxLocation } from "@/lib/calgaryAreas";

export const SERVICES: { iconName: IconName; label: string }[] = [
  { iconName: "wrench", label: "General Handyman" },
  { iconName: "pipe", label: "Plumbing Repair" },
  { iconName: "zap", label: "Electrical Work" },
  { iconName: "thermometer", label: "HVAC Maintenance" },
  { iconName: "hammer", label: "Carpentry" },
  { iconName: "paint-roller", label: "Painting" },
  { iconName: "layers", label: "Drywall / Flooring" },
  { iconName: "car", label: "Oil Change" },
  { iconName: "circle-dashed", label: "Tire Swap / Rotation" },
  { iconName: "battery", label: "Battery / Brakes" },
  { iconName: "car", label: "Vehicle Maintenance" },
  { iconName: "tree", label: "Landscaping" },
  { iconName: "snowflake", label: "Snow Removal" },
  { iconName: "cloud-rain", label: "Gutters" },
  { iconName: "door", label: "Windows & Doors" },
  { iconName: "building", label: "Siding & Roofing" },
  { iconName: "garage-door", label: "Garage" },
  { iconName: "wind", label: "Air Conditioning" },
  { iconName: "sparkles", label: "Cleaning Services" },
  { iconName: "trowel", label: "Concrete / Masonry" },
  { iconName: "key", label: "Locksmith" },
  { iconName: "refrigerator", label: "Appliance Repair / Install" },
  { iconName: "sun", label: "Solar" },
  { iconName: "package", label: "Moving & Storage" },
  { iconName: "trash", label: "Junk Removal" },
  { iconName: "sparkles", label: "Pest Control" },
  { iconName: "wind", label: "Duct Cleaning" },
  { iconName: "toolbox", label: "Fencing" },
  { iconName: "hammer", label: "Decks & Patios" },
  { iconName: "sparkles", label: "Window Cleaning" },
  { iconName: "home", label: "Home Renovations" },
  { iconName: "layers", label: "Insulation" },
  { iconName: "cloud-rain", label: "Eavestrough Cleaning" },
  { iconName: "droplet", label: "Basement / Waterproofing" },
  { iconName: "droplet", label: "Pressure Washing" },
  { iconName: "package", label: "Other" },
];

export const SCHEDULES: { iconName: IconName; label: string; sub: string }[] = [
  { iconName: "zap", label: "Urgent / ASAP",  sub: "Within 24 hours" },
  { iconName: "calendar", label: "This Week",       sub: "Next 2–5 days" },
  { iconName: "calendar", label: "Flexible",        sub: "I'm not in a rush" },
  { iconName: "refresh", label: "Recurring",       sub: "Regular maintenance" },
];

/** Home-page service names → SERVICES labels (the ?service= deep link). */
export const HOME_TO_SERVICE: Record<string, string> = {
  "General Repairs": "General Handyman",
  "Plumbing": "Plumbing Repair",
  "Electrical": "Electrical Work",
  "HVAC": "HVAC Maintenance",
  "Drywall & Flooring": "Drywall / Flooring",
};

/** A ?service= value, mapped, if it names a known service; else null. ADD, never replace (web). */
export function serviceFromParam(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const mapped = HOME_TO_SERVICE[raw] ?? raw;
  return SERVICES.some(sv => sv.label === mapped) ? mapped : null;
}

/**
 * What the contractor reads. The answers and tags are folded into the description
 * text; on a split they ride on exactly ONE part (`withExtras`).
 */
export function composedPart(text: string, withExtras: boolean, primaryService: string, answers: JobAnswers, tags: string[]): string {
  const parts = [text.trim()];
  if (withExtras) {
    const sum = answerSummary(primaryService, answers);
    if (sum) parts.push(sum);
    if (tags.length) parts.push("Details: " + tags.join(", "));
  }
  return parts.join("\n\n");
}

/** Display name from the email local-part, so signup doesn't ask for a name. */
export function namesFromEmail(email: string): { first: string; last: string } {
  const localRaw = (email.split("@")[0] || "");
  const local = localRaw.replace(/\d+/g, "");
  const parts = local.split(/[._\-+]+/).filter(pt => pt.length > 1);
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  let first = parts[0] ? cap(parts[0]) : "";
  const last = parts[1] ? cap(parts[1]) : "";
  if (!first) { const fallback = (localRaw.replace(/[^A-Za-z]/g, "") || localRaw); first = fallback ? cap(fallback) : ""; }
  return { first, last };
}

export const SEASON_PRESETS = [
  { label: "Spring", start: "-04-01", end: "-06-30" },
  { label: "Summer", start: "-07-01", end: "-09-30" },
  { label: "Fall",   start: "-10-01", end: "-11-30" },
  { label: "Winter", start: "-12-01", end: "-03-31" },
];

/** web applySeason: the start/end dates a season chip fills in. */
export function seasonRange(sp: typeof SEASON_PRESETS[0]): { start: string; end: string } {
  const yr = new Date().getFullYear();
  const startYr = sp.label === "Winter" && new Date().getMonth() >= 11 ? yr + 1 : yr;
  const endYr   = sp.label === "Winter" ? startYr + 1 : startYr;
  return { start: startYr + sp.start, end: endYr + sp.end };
}

/**
 * Last time's location, read back as an APPROXIMATE one. `.text` is empty unless
 * BOTH halves parsed, which is what hides "same as last time" for a legacy street
 * address (re-posting one is what web's approximate-location change stops).
 */
export function lastApprox(location: string | null | undefined): { postal: string; area: string; text: string } {
  const p = parseApproxLocation(location ?? "");
  return { ...p, text: p.postal && p.area ? formatApproxLocation(p.postal, p.area) : "" };
}

/** web PhotoPicker: a picked photo over 10 MB is refused before compression, with these words. */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_TOO_BIG = "That photo is over 10 MB. Please choose a smaller one.";
