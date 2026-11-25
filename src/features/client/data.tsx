// The client's own reads, loaded once for every tab (port of the load in web
// ClientDashboard.tsx ~470). One provider, so the tab bar (which needs the pro and
// past-request counts for clientNav) and the Requests tab read the SAME arrays.
//
// Three outcomes, never two (CLAUDE.md): "ok", "error" (couldn't tell: a DeadEnd
// with retry, never a confident "no requests"), and signed out (back to the gate).
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { readAuthUser } from "@/lib/authRead";
import { clearMyProfile } from "@/lib/myProfile";

export type ClientData = {
  userId: string;
  email: string | null;
  profile: any | null;
  requests: any[];
  pros: any[];
  /** list_my_pros failed: `pros` is the last good list (or empty), and the Pros tab says it couldn't load. */
  prosFailed: boolean;
  plans: any[];
  /** list_my_recurring_plans failed: `plans` is the last good list (or empty), so "no plans" is never a guess. */
  plansFailed: boolean;
};

type State =
  | { kind: "loading" }
  /** `last`: the last good load, when a REFRESH failed. A screen may keep showing it
   *  (with a "couldn't refresh" note) instead of unmounting what the user is doing. */
  | { kind: "error"; last: ClientData | null }
  | { kind: "ok"; data: ClientData };

type Ctx = {
  state: State;
  /** Re-run every read. Resolves when done; the screen renders the outcome. */
  reload: () => Promise<void>;
};

const ClientCtx = createContext<Ctx | null>(null);

export function ClientDataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const seq = useRef(0);
  const lastPros = useRef<any[]>([]);
  const lastPlans = useRef<any[]>([]);
  const lastOk = useRef<ClientData | null>(null);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    const set = (s: State) => {
      if (mine !== seq.current) return;
      if (s.kind === "ok") lastOk.current = s.data;
      setState(s);
    };
    const fail = () => set({ kind: "error", last: lastOk.current });
    try {
      const who = await readAuthUser();
      if (who.kind === "unknown") return fail();
      if (who.kind === "signedOut") { lastOk.current = null; router.replace("/"); return; }
      const uid = who.userId;
      const [prof, reqs, pros, plans] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        supabase.from("client_requests").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.rpc("list_my_pros"),
        supabase.rpc("list_my_recurring_plans"),
      ]);
      // Web rule: a failed profile/requests read shows error + retry, never "no jobs".
      if (prof.error || reqs.error) return fail();
      let profile = prof.data;
      if (!profile) {
        // Half-finished signup: self-repair, same as web. A non-client role goes back
        // through the gate, which owns role routing.
        const { data: role, error } = await supabase.rpc("ensure_profile", { p_role: "client" });
        clearMyProfile();
        if (error) return fail();
        if (role && role !== "client") { lastOk.current = null; router.replace("/"); return; }
        const again = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
        if (again.error) return fail();
        profile = again.data;
      }
      const prosFailed = !!pros.error || !Array.isArray(pros.data);
      if (!prosFailed) lastPros.current = pros.data as any[];
      const plansFailed = !!plans.error || !Array.isArray(plans.data);
      if (!plansFailed) lastPlans.current = plans.data as any[];
      set({
        kind: "ok",
        data: {
          userId: uid,
          email: who.email ?? null,
          profile,
          requests: reqs.data ?? [],
          // A failed pros read keeps the last good list, so the tab doesn't vanish on
          // a blip, and flags it so the tab says "couldn't load", never "no pros"
          // (review G4c #2). Plans the same way: they gate an Account row, which a
          // failed read keeps showing rather than hiding (CodeRabbit #6).
          pros: prosFailed ? lastPros.current : pros.data,
          prosFailed,
          plans: plansFailed ? lastPlans.current : (plans.data as any[]),
          plansFailed,
        },
      });
    } catch {
      fail();
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return <ClientCtx.Provider value={{ state, reload }}>{children}</ClientCtx.Provider>;
}

export function useClientData(): Ctx {
  const c = useContext(ClientCtx);
  if (!c) throw new Error("useClientData outside ClientDataProvider");
  return c;
}
