// The contractor's own reads, loaded once for every tab (port of the load in web
// ContractorDashboard.tsx ~490). Same shape as features/client/data.tsx: three
// outcomes, and the five load-bearing reads are checked BEFORE the self-repair, so
// a timed-out query is never "repaired" as if the rows were absent (web rule).
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { readAuthUser } from "@/lib/authRead";
import { clearMyProfile } from "@/lib/myProfile";

export type ContractorData = {
  userId: string;
  email: string | null;
  profile: any | null;
  contractor: any | null;
  jobs: any[];
  openJobs: any[];
  disputes: any[];
  /** Decoration-only reads: a failure is flagged, never shown as a zero. */
  reviews: any[]; reviewsFailed: boolean;
  portfolio: any[]; portfolioFailed: boolean;
  earnStats: any | null; earnStatsFailed: boolean;
  bidsCount: number | null;
  /** job_id -> service-agreement status (web loadContracts). A job with no row is "not started". */
  contracts: Record<string, string>;
  /** The job_contracts read failed: "send the agreement" stays silent rather than guess (web contractsFailed). */
  contractsFailed: boolean;
};

type State = { kind: "loading" } | { kind: "error" } | { kind: "ok"; data: ContractorData };
type Ctx = { state: State; reload: () => Promise<void> };

const JOB_SELECT = "*, request:client_requests!jobs_request_id_fkey(service_needed, job_description, preferred_schedule, location, photo_path, estimated_quote, quote_notes, vehicle_details, recurring, recurring_frequency, budget_min, budget_max, budget_flexible), client:profiles!jobs_client_id_fkey(first_name)";

const ContractorCtx = createContext<Ctx | null>(null);

export function ContractorDataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    const set = (s: State) => { if (mine === seq.current) setState(s); };
    try {
      const who = await readAuthUser();
      if (who.kind === "unknown") return set({ kind: "error" });
      if (who.kind === "signedOut") { router.replace("/"); return; }
      const uid = who.userId;
      const [prof, con, pf, jobs, open, revs, disp, earn, bids] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        supabase.from("contractors").select("*").eq("id", uid).maybeSingle(),
        supabase.from("portfolio_items").select("*").eq("contractor_id", uid).order("created_at", { ascending: false }),
        supabase.from("jobs").select(JOB_SELECT).eq("contractor_id", uid).order("created_at", { ascending: false }),
        supabase.rpc("list_open_jobs"),
        supabase.from("reviews").select("*, client:profiles!reviews_client_id_fkey(first_name)").eq("contractor_id", uid).order("created_at", { ascending: false }),
        supabase.from("disputes").select("*").eq("contractor_id", uid).order("created_at", { ascending: false }),
        supabase.rpc("get_contractor_earnings_stats"),
        supabase.from("bids").select("id", { count: "exact", head: true }).eq("contractor_id", uid),
      ]);
      // Web's five load-bearing reads (ContractorDashboard.tsx:530).
      if (prof.error || con.error || jobs.error || disp.error || open.error) return set({ kind: "error" });
      let profile = prof.data, contractor = con.data;
      if (!profile || !contractor) {
        const { data: role, error } = await supabase.rpc("ensure_profile", { p_role: "contractor" });
        clearMyProfile();
        if (error) return set({ kind: "error" });
        if (role && role !== "contractor") { router.replace("/"); return; }
        const [p2, c2] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
          supabase.from("contractors").select("*").eq("id", uid).maybeSingle(),
        ]);
        if (p2.error || c2.error) return set({ kind: "error" });
        profile = p2.data; contractor = c2.data;
      }
      // web loadContracts: a failed read is recorded, never read as "nothing sent yet".
      const jobRows = jobs.data ?? [];
      const contracts: Record<string, string> = {};
      let contractsFailed = false;
      if (jobRows.length > 0) {
        const jc = await supabase.from("job_contracts").select("job_id, status").in("job_id", jobRows.map((j) => j.id));
        if (jc.error || !jc.data) contractsFailed = true;
        else for (const c of jc.data) if (c.job_id && c.status) contracts[c.job_id] = c.status;
      }
      set({
        kind: "ok",
        data: {
          userId: uid, email: who.email ?? null, profile, contractor,
          jobs: jobRows, openJobs: Array.isArray(open.data) ? open.data : [], disputes: disp.data ?? [],
          reviews: revs.data ?? [], reviewsFailed: !!revs.error,
          portfolio: pf.data ?? [], portfolioFailed: !!pf.error,
          earnStats: earn.error ? null : earn.data ?? null, earnStatsFailed: !!earn.error,
          bidsCount: bids.error ? null : bids.count ?? 0,
          contracts, contractsFailed,
        },
      });
    } catch {
      set({ kind: "error" });
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  return <ContractorCtx.Provider value={{ state, reload }}>{children}</ContractorCtx.Provider>;
}

export function useContractorData(): Ctx {
  const c = useContext(ContractorCtx);
  if (!c) throw new Error("useContractorData outside ContractorDataProvider");
  return c;
}
