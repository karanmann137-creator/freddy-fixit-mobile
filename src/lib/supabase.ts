// NATIVE OVERRIDE of web src/lib/supabase.ts. Same exports: `supabase`, `UserRole`.
// PLAN.md §4.1. Not synced: this file is the reason synced files can import
// "@/lib/supabase" unchanged.
//
// ⚠️ onAuthStateChange: do synchronous work only (set a flag, clearMyProfile()).
// A Supabase query inside the callback deadlocks the auth lock. Web rule, same here.
import { AppState } from "react-native";
import { createClient, processLock } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { secureSession } from "@/platform/secureSession";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Fail loudly in dev rather than shipping a client that silently reads nothing.
  throw new Error("EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY missing. Copy .env.example to .env.");
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: secureSession,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // no URL on native; deep links call verifyOtp themselves (§4.4)
    flowType: "pkce",
    lock: processLock,
  },
});

// Refresh tokens only while the app is in the foreground.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

// Roles used across role-gated routes/dashboards. Keep identical to web.
export type UserRole = "client" | "contractor" | "admin";
