// Rate a finished job (PLAN step 4.13): port of web ClientDashboard's rating form
// (submitReview) for a COMPLETED job. Same RPC and fields as web:
//   submit_review(p_job_id, p_price, p_experience, p_result, p_comment || null)
// with three 1..10 scores that start at 8, as web's sliders do. Every rule (one review
// per job, who may review, completed only) lives in the RPC: when it refuses, its
// sentence is shown as it comes back ("Couldn't submit rating: <reason>"), and the
// form stays so nothing typed is lost.
//
// Reads are three-outcome: request ownership is the id comparison (request.user_id
// against the signed-in id, never "the read returned a row"), the job and the existing
// review are separate reads that each say "couldn't load" + retry, never a confident
// "not rated yet" (a failed reviews read must not offer a second rating).
// After a rating the job-done ask (Google review + referral share) is offered once
// through requestCompletionThanks, which obeys the same opt-out/cooldown as web.
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Card, DeadEnd, Field, FormNote, Row, Screen, ScreenHeader, SkRow, Txt, rgba, useDelayed, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { requestCompletionThanks } from "@/lib/completionPrompt";
import { useClientData } from "./data";

type Reads =
  | { kind: "error" }
  | { kind: "nojob" }
  | { kind: "notdone" }
  | { kind: "ok"; jobId: string; reviewed: boolean; proName: string | null };

async function readJob(requestId: string, userId: string): Promise<Reads> {
  try {
    const j = await supabase.from("jobs").select("id, status, client_id, contractor_id").eq("request_id", requestId).neq("status", "cancelled")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (j.error) return { kind: "error" };
    const job = j.data;
    // A job that isn't this person's is "no job", whatever the read allowed.
    if (!job || (job.client_id && job.client_id !== userId)) return { kind: "nojob" };
    if (job.status !== "completed") return { kind: "notdone" };
    const [rv, pro] = await Promise.all([
      supabase.from("reviews").select("id").eq("job_id", job.id).maybeSingle(),
      job.contractor_id ? supabase.rpc("get_contractor_profile", { p_id: job.contractor_id }).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (rv.error) return { kind: "error" }; // not "not rated yet": we couldn't tell
    const proName = !pro.error && pro.data ? ((pro.data as { first_name?: string | null }).first_name ?? null) : null;
    return { kind: "ok", jobId: job.id, reviewed: !!rv.data, proName };
  } catch {
    return { kind: "error" };
  }
}

const AXES = [
  { key: "price", label: "Price" },
  { key: "experience", label: "Experience" },
  { key: "result", label: "End result" },
] as const;
type Axis = (typeof AXES)[number]["key"];
const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function ReviewScreen() {
  const { t } = useTheme();
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const requestId = (Array.isArray(params.requestId) ? params.requestId[0] : params.requestId) ?? "";
  const { state, reload } = useClientData();
  const showSkeleton = useDelayed();
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; reads: Reads } | null>(null);
  const [form, setForm] = useState<Record<Axis, number> & { comment: string }>({ price: 8, experience: 8, result: 8, comment: "" });
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const data = state.kind === "ok" ? state.data : null;
  const userId = data?.userId ?? null;
  const req = data ? data.requests.find((r) => r.id === requestId) ?? null : null;
  // The id comparison: the request must be the signed-in person's own.
  const mine = !!req && !!userId && req.user_id === userId;
  const ready = mine && req?.status === "completed";

  const key = `${requestId}|${userId}|${nonce}`;
  useEffect(() => {
    if (!ready || !userId) return;
    let stale = false;
    void readJob(requestId, userId).then((reads) => { if (!stale) setLoaded({ key, reads }); });
    return () => { stale = true; };
  }, [ready, requestId, userId, key]);
  const retry = useCallback(() => setNonce((n) => n + 1), []);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/client/history"));
  const toHistory = <Button onPress={() => router.replace("/client/history")}>Back to history</Button>;

  if (state.kind === "error") return <DeadEnd msg="We couldn't load your requests. Check your connection, then try again." onRetry={() => void reload()} />;
  if (state.kind === "loading") return <Screen><ScreenHeader title="Rate your pro" />{showSkeleton ? <View style={{ paddingTop: t.s6, gap: t.s4 }}><SkRow /><SkRow /></View> : null}</Screen>;
  if (!requestId || !mine) return <DeadEnd msg="We couldn't find that request." retry={false} alt={toHistory} />;
  if (!ready) return <DeadEnd msg="You can rate a pro once the job is finished." retry={false} alt={toHistory} />;

  const cur = loaded && loaded.key === key ? loaded.reads : null;
  if (!cur) return <Screen><ScreenHeader title="Rate your pro" />{showSkeleton ? <View style={{ paddingTop: t.s6, gap: t.s4 }}><SkRow /><SkRow /></View> : null}</Screen>;
  if (cur.kind === "error") return <DeadEnd msg="We couldn't load this job. Check your connection, then try again." onRetry={retry} />;
  if (cur.kind === "nojob") return <DeadEnd msg="We couldn't find the job for this request." retry={false} alt={toHistory} />;
  if (cur.kind === "notdone") return <DeadEnd msg="You can rate a pro once the job is finished." retry={false} alt={toHistory} />;

  const proName = cur.proName ?? "your contractor";
  if (cur.reviewed || done) {
    return (
      <Screen>
        <ScreenHeader title="Rate your pro" onBack={back} />
        <Card style={{ marginTop: t.s6 }}>
          <Row icon="check-circle" tone="good" title="Completed. Thanks for rating your contractor!" sub={`Your rating of ${proName} is in.`} />
        </Card>
        <View style={{ marginTop: t.s4 }}>{toHistory}</View>
      </Screen>
    );
  }

  const submit = async () => {
    if (busy) return;
    setBusy(true); setRefusal(null);
    try {
      const { error } = await supabase.rpc("submit_review", {
        p_job_id: cur.jobId, p_price: form.price, p_experience: form.experience, p_result: form.result, p_comment: form.comment || null,
      });
      if (error) { setRefusal("Couldn't submit rating: " + error.message); return; }
    } catch {
      setRefusal("Couldn't submit rating. Check your connection, then try again.");
      return;
    } finally { setBusy(false); }
    setDone(true);
    // The job-done ask. The referral half needs the code; a failed read just drops that half.
    try {
      const r = await supabase.rpc("get_my_referral");
      const ref = r.error ? null : (r.data as { code?: string | null; code_status?: string | null } | null);
      await requestCompletionThanks({ jobId: cur.jobId, code: ref?.code, codeStatus: ref?.code_status });
    } catch { /* the rating is saved; the ask is a bonus */ }
  };

  return (
    <Screen>
      <ScreenHeader title="Rate your pro" onBack={back} />
      <Txt variant="display" size={1.4} lh={1.2} accessibilityRole="header" style={{ marginTop: t.s4 }}>{`Rate ${proName} (out of 10)`}</Txt>
      {AXES.map(({ key: k, label }) => (
        <View key={k} style={{ marginTop: t.s5 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: t.s2 }}>
            <Txt size={0.88} color={rgba(t.muted, 0.85)}>{label}</Txt>
            <Txt variant="label" size={1}>{`${form[k]}/10`}</Txt>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2 }}>
            {SCORES.map((n) => {
              const on = form[k] === n;
              return (
                <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${label} ${n} out of 10`} accessibilityState={{ selected: on }}
                  onPress={() => setForm((f) => ({ ...f, [k]: n }))}
                  style={{ width: t.hCtl, height: t.hCtl, borderRadius: t.r2, alignItems: "center", justifyContent: "center", borderWidth: t.hairW,
                    borderColor: on ? t.text : t.cardBorder, backgroundColor: on ? rgba(t.fg, 0.14) : t.cardBg }}>
                  <Txt variant={on ? "bodyBold" : "body"}>{String(n)}</Txt>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <Field label="Comment (optional)" value={form.comment} onChangeText={(v) => setForm((f) => ({ ...f, comment: v }))} multiline placeholder="Optional comment" />
      {refusal ? <View style={{ marginTop: t.s4 }}><FormNote>{refusal}</FormNote></View> : null}
      <View style={{ marginTop: t.s5 }}>
        <Button variant="primary" full loading={busy} onPress={() => void submit()}>Submit rating</Button>
      </View>
    </Screen>
  );
}
