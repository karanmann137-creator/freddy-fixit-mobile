// Pure derivations for the contractor home, ported from web ContractorDashboard.tsx.
import type { State } from "@/kit";
import { jobIsLive } from "@/lib/jobStage";

// ── Tabs (web visibleNav, ContractorDashboard.tsx:80) ─────────────────────────
// Each optional area appears the moment it has something in it (web: Hick's law).
// On a phone: Jobs / Available / Messages / Earnings / Account are tabs; Reviews
// and Calendar are rows (Account and Jobs), gated by the same counts.
export function contractorNav(o: { scheduled: number; earned: number; reviews: number }) {
  return { calendar: o.scheduled > 0, earnings: o.earned > 0, reviews: o.reviews > 0 };
}

export const navCounts = (d: { jobs: any[]; contractor: any | null; reviews: any[] }) => ({
  scheduled: d.jobs.filter((j) => !!j.scheduled_at).length,
  earned: Number(d.contractor?.total_earned ?? 0),
  reviews: d.reviews.length,
});

export type PassView = { state: State; label: string; hero: string; sub?: string };

// The contractor attention chain (web ContractorDashboard.tsx ~1760) reads
// photosMissing / canWithdraw and the payout and claim states, which need W1 and
// the job screen (5.6/5.7). Until then the pass never says "your turn" or
// "nothing needed" about a live job: it points at the website, which can answer.
export function contractorPass(d: { jobs: any[]; contractor: any | null; disputes: any[] }): PassView {
  const live = d.jobs.filter((j) => jobIsLive(j) || j.status === "disputed");
  if (live.length > 0) {
    return {
      state: "wait", label: "ON THE WEBSITE",
      hero: live.length === 1 ? "Manage your job on freddyfixit.ca for now." : "Manage your " + live.length + " jobs on freddyfixit.ca for now.",
      sub: "Proposals, photos, the agreement and payouts are on the website until the next app update.",
    };
  }
  return { state: "ok", label: "NOTHING BOOKED", hero: "No jobs on the go right now.", sub: "New work in your area shows up under Available." };
}

const STATUS: Record<string, string> = {
  assigned: "Picked: send time and price", scheduled: "Booked", in_progress: "In progress",
  pending_confirmation: "Waiting on the client", completed: "Done", cancelled: "Cancelled", disputed: "Claim open",
};
export const jobStatusLabel = (j: any) => STATUS[j?.status] ?? String(j?.status ?? "—");
