// SYNCED from freddy-fixit@fd39b99:src/lib/jobCode.ts. DO NOT EDIT HERE.
// Edit the web repo, then run `npm run sync`. See PLAN.md §2.
// A short, human-readable ID for a job that clients can quote when filing a
// claim or contacting support. Derived deterministically from the job's UUID —
// no DB column needed. Example: "3f9a1c2d-…" -> "FFX-3F9A1".
export function jobCode(id?: string | null): string {
  if (!id) return "";
  const hex = id.replace(/[^a-f0-9]/gi, "").slice(0, 5).toUpperCase();
  return hex ? `FFX-${hex}` : "";
}
