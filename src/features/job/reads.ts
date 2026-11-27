// The reads behind a client's job: the job row, the agreement gate, the re-post
// answer and the display-only fee inputs. Shared by the job screen and the
// Requests tab, so the attention rows and the controls they point at are derived
// from the SAME answers (web: "one predicate, shared by every reader").
//
// Every read has three outcomes. A failed contract read is "blocked, couldn't
// verify", never "signed" (web: contractBlocked starts true and clears only on a
// positive contract_signed). Nothing here computes money.
import { supabase } from "@/lib/supabase";
import { readAuthUser } from "@/lib/authRead";
import { getFeeRate } from "@/lib/platformRates";

/**
 * The agreement gate. `signed` is true ONLY when contract_signed() answered
 * exactly `true`; loading and error both leave the job blocked.
 * `status` (draft|sent|signed|void) words the attention row only; the gate is `signed`.
 */
export type ContractGate =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ok"; signed: boolean; status: string | null };

/** Fail CLOSED: anything but a positive answer is blocked. */
export const contractBlockedBy = (g: ContractGate): boolean => !(g.kind === "ok" && g.signed === true);
/** "We couldn't verify": the read failed, so the reason shown is "try again", not "sign it". */
export const contractCheckFailed = (g: ContractGate): boolean => g.kind === "error";

export async function readContractGate(jobId: string): Promise<ContractGate> {
  try {
    const [s, c] = await Promise.all([
      supabase.rpc("contract_signed", { p_job_id: jobId }),
      supabase.from("job_contracts").select("status").eq("job_id", jobId).maybeSingle(),
    ]);
    if (s.error) return { kind: "error" };
    // Status is wording only (web ignores its error too); the gate is the RPC.
    return { kind: "ok", signed: s.data === true, status: c.error ? null : ((c.data as { status?: string | null } | null)?.status ?? null) };
  } catch {
    return { kind: "error" };
  }
}

/**
 * job_repost_block: the SERVER's answer to "may the client re-post this job?".
 * null = allowed, a string = the reason it isn't, undefined = we couldn't tell or
 * it doesn't apply (not `assigned`). Only null offers the button (web canRepost).
 */
export async function readRepostBlock(job: any): Promise<string | null | undefined> {
  if (!job?.id || job.status !== "assigned") return undefined;
  try {
    const { data, error } = await supabase.rpc("job_repost_block", { p_job_id: job.id });
    if (error) return undefined;
    return (data as string | null) ?? null;
  } catch {
    return undefined;
  }
}

export type JobExtras = { gate: ContractGate; repostBlock: string | null | undefined };

export async function readJobExtras(job: any): Promise<JobExtras> {
  if (!job?.id) return { gate: { kind: "ok", signed: false, status: null }, repostBlock: undefined };
  const [gate, repostBlock] = await Promise.all([readContractGate(job.id), readRepostBlock(job)]);
  return { gate, repostBlock };
}

export type ClientJob = JobExtras & {
  userId: string;
  job: any;
  proName: string | null;
  /** platform_fee_rate() for the pre-charge estimate; null when it couldn't be read (then no figure is shown). */
  feeRate: number | null;
  /** referral_waiver_eligible for THIS job: the 3% fee is waived (display only, the charge path decides). */
  waived: boolean;
};

export type ClientJobRead =
  | { kind: "ok"; value: ClientJob }
  | { kind: "error" }
  | { kind: "signedOut" }
  /** No job by that id, or not this person's: a settled refusal, not a retry. */
  | { kind: "missing" };

export async function readClientJob(jobId: string): Promise<ClientJobRead> {
  try {
    const who = await readAuthUser();
    if (who.kind === "unknown") return { kind: "error" };
    if (who.kind === "signedOut") return { kind: "signedOut" };
    const j = await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle();
    if (j.error) return { kind: "error" };
    const job = j.data as any;
    // Ownership is the id comparison, never "the RLS-filtered read returned a row"
    // (web 2026-11-09: an oversight policy makes that true for the admin on every job).
    if (!job || job.client_id !== who.userId) return { kind: "missing" };
    const [pro, extras, rate, waiver] = await Promise.all([
      job.contractor_id ? supabase.rpc("get_contractor_profile", { p_id: job.contractor_id }).maybeSingle() : Promise.resolve({ data: null, error: null }),
      readJobExtras(job),
      getFeeRate(),
      job.payment_status !== "released" && job.total_charged == null
        ? supabase.rpc("referral_waiver_eligible", { p_client: who.userId, p_job_id: job.id })
        : Promise.resolve({ data: false, error: null }),
    ]);
    const proName = !pro.error && pro.data ? ((pro.data as { first_name?: string | null }).first_name ?? null) : null;
    return {
      kind: "ok",
      value: { userId: who.userId, job, proName, ...extras, feeRate: rate.ok ? rate.rate : null, waived: !waiver.error && waiver.data === true },
    };
  } catch {
    return { kind: "error" };
  }
}

/** Read the reason off a failed functions.invoke: invoke() drops the body, so it's on error.context. */
export async function invokeReason(error: unknown, data: unknown, fallback: string): Promise<string | null> {
  const bodyErr = (data as { error?: unknown } | null)?.error;
  if (!error) return typeof bodyErr === "string" && bodyErr ? bodyErr : null;
  let m = (error as { message?: string })?.message || fallback;
  try {
    const ctx = (error as { context?: { json?: () => Promise<{ error?: unknown }> } }).context;
    const j = await ctx?.json?.();
    if (typeof j?.error === "string" && j.error) m = j.error;
  } catch { /* the body wasn't JSON: keep the message */ }
  return m;
}
