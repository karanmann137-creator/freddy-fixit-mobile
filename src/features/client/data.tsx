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
  plans: any[];
};

type State =
  | { kind: "loading" }
  | { kind: "error" }
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

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    const set = (s: State) => { if (mine === seq.current) setState(s); };
    try {
      const who = await readAuthUser();
      if (who.kind === "unknown") return set({ kind: "error" });
      if (who.kind === "signedOut") { router.replace("/"); return; }
      const uid = who.userId;
      const [prof, reqs, pros, plans] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        supabase.from("client_requests").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.rpc("list_my_pros"),
        supabase.rpc("list_my_recurring_plans"),
      ]);
      // Web rule: a failed profile/requests read shows error + retry, never "no jobs".
      if (prof.error || reqs.error) return set({ kind: "error" });
      let profile = prof.data;
      if (!profile) {
        // Half-finished signup: self-repair, same as web. A non-client role goes back
        // through the gate, which owns role routing.
        const { data: role, error } = await supabase.rpc("ensure_profile", { p_role: "client" });
        clearMyProfile();
        if (error) return set({ kind: "error" });
        if (role && role !== "client") { router.replace("/"); return; }
        const again = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
        if (again.error) return set({ kind: "error" });
        profile = again.data;
      }
      set({
        kind: "ok",
        data: {
          userId: uid,
          email: who.email ?? null,
          profile,
          requests: reqs.data ?? [],
          // These two only drive WHICH tabs/rows appear. A failed read hides an
          // optional tab (web does the same: `myPros.data ?? []`); it never asserts
          // anything about money or a job.
          pros: Array.isArray(pros.data) ? pros.data : [],
          plans: Array.isArray(plans.data) ? plans.data : [],
        },
      });
    } catch {
      set({ kind: "error" });
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
