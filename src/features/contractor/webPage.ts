// ⚠️ PORTED FROM A WEB PAGE FILE, not from src/lib. Web prerequisite (PLAN W5):
// move each item below into a web src/lib module (e.g. src/lib/contractorForm.ts),
// add it to the SHARED list, `npm run sync`, then delete this file and import the
// synced copy. Until then every line here is a faithful copy of the web source
// named beside it, so both clients write the same rows. Change nothing here that
// isn't changed on web first.
//
//   SPECIALTIES        pages/ContractorOnboarding.tsx:21 (the CANONICAL list: stored in
//                      contractors.specialties, matched by BrowseContractors' exact-string filter)
//   WORK_TYPES         pages/ContractorOnboarding.tsx:59 (drives the credential copy and
//                      the per-document "needed before approval" flags)
//   STEP_TITLES        pages/ContractorOnboarding.tsx:74
//   namesFromEmail     pages/ContractorOnboarding.tsx:87 (NOT the client page's version:
//                      this one has no fallback when the local part has no word)
//   DOCS / docRequired pages/ContractorOnboarding.tsx:367 (DOC_NAMES) + 834 (the document list)
//   DOC_MAX_BYTES      pages/ContractorOnboarding.tsx:202 (docFileError: 10 MB)
//   AVATAR_MAX_BYTES   pages/ContractorOnboarding.tsx:826 (the photo input: 5 MB)
//   CONTRACTOR_DRAFT_KEY  pages/ContractorOnboarding.tsx:162 (localStorage key, same name)
import type { IconName } from "@/kit";

export const SPECIALTIES: { iconName: IconName; label: string }[] = [
  { iconName: "wrench", label: "General Repairs" },
  { iconName: "pipe", label: "Plumbing" },
  { iconName: "zap", label: "Electrical" },
  { iconName: "thermometer", label: "HVAC" },
  { iconName: "hammer", label: "Carpentry" },
  { iconName: "paint-roller", label: "Painting" },
  { iconName: "layers", label: "Drywall" },
  { iconName: "layers", label: "Flooring / Tile" },
  { iconName: "circle-dashed", label: "Tire Swap / Rotation" },
  { iconName: "car", label: "Oil Change" },
  { iconName: "battery", label: "Battery / Brakes" },
  { iconName: "car", label: "Vehicle Maintenance" },
  { iconName: "tree", label: "Landscaping" },
  { iconName: "snowflake", label: "Snow Removal" },
  { iconName: "cloud-rain", label: "Gutters" },
  { iconName: "door", label: "Windows & Doors" },
  { iconName: "building", label: "Siding & Roofing" },
  { iconName: "garage-door", label: "Garage" },
  { iconName: "trowel", label: "Concrete / Masonry" },
  { iconName: "wind", label: "Air Conditioning" },
  { iconName: "sparkles", label: "Cleaning Services" },
  { iconName: "key", label: "Locksmith" },
  { iconName: "refrigerator", label: "Appliance Repair / Install" },
  { iconName: "sun", label: "Solar" },
];

export type WorkType = { id: string; label: string; sub: string; licence: "required" | "optional" | "none"; insurance: "required" | "recommended" };

export const WORK_TYPES: WorkType[] = [
  { id:"regulated",     label:"Regulated trade",             sub:"Electrical, gas, plumbing, HVAC — needs a provincial certificate", licence:"required",    insurance:"required"    },
  { id:"skilled",       label:"Skilled trade",               sub:"Carpentry, drywall, painting, flooring, roofing, concrete, appliance install", licence:"optional", insurance:"required" },
  { id:"handyman",      label:"General handyman & repairs",  sub:"Multi-skill repairs and small jobs around the home",               licence:"optional",    insurance:"recommended" },
  { id:"moving",        label:"Moving, assembly & delivery", sub:"Furniture & appliance moving, assembly, hauling — no trade licence needed", licence:"none", insurance:"recommended" },
  { id:"home_services", label:"Cleaning, yard & seasonal",   sub:"Cleaning, landscaping, snow removal, gutters",                     licence:"none",        insurance:"recommended" },
];

export const STEP_TITLES = ["Let's start with the basics", "Tell us what you do", "Set your area and availability", "Add your credentials", "Upload your photo and documents"];

/** Guess first/last name from an email address ("mike.taylor84@…" → Mike Taylor). Prefill only. */
export function namesFromEmail(email: string): { first: string; last: string } {
  const local = (email.split("@")[0] || "").replace(/\d+/g, "");
  const parts = local.split(/[._\-+]+/).filter(p => p.length > 1);
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  return { first: parts[0] ? cap(parts[0]) : "", last: parts[1] ? cap(parts[1]) : "" };
}

export type DocKey = "insurance" | "wcb" | "certification" | "gov_id";
export const DOC_KEYS: DocKey[] = ["insurance", "wcb", "certification", "gov_id"];
export const DOC_NAMES: Record<DocKey, string> = { insurance: "insurance certificate", wcb: "WCB clearance", certification: "trade certification", gov_id: "government ID" };

/** The step-5 document list, with web's "Needed before approval" flags. */
export function docList(wt: WorkType | undefined, operatesAlone: boolean): { key: DocKey; label: string; required: boolean; hint: string }[] {
  const insuranceRequired = wt?.insurance === "required";
  return [
    { key:"insurance",    label:"Liability Insurance Certificate", required:insuranceRequired,  hint:"Certificate of Insurance showing min. $1M coverage in Alberta" },
    { key:"wcb",          label:"WCB / Workers Comp Certificate",  required:insuranceRequired && !operatesAlone,  hint: operatesAlone ? "Not required — you operate alone (WCB exempt)" : "WCB clearance letter issued within the last 90 days" },
    { key:"certification",label:"Trade Certification",             required: wt?.licence === "required", hint:"Red Seal, provincial licence, or other trade credential" },
    { key:"gov_id",       label:"Government-Issued Photo ID",      required:true,  hint:"Driver's licence or passport — name must be clearly visible" },
  ];
}

export const DOC_MAX_BYTES = 10 * 1024 * 1024;
export const DOC_TOO_BIG = "File must be under 10MB. Try a smaller photo or PDF.";
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_TOO_BIG = "Photo must be under 5MB. Please choose a smaller one.";

export const CONTRACTOR_DRAFT_KEY = "ff_contractor_draft";
