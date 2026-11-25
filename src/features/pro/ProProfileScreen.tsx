// Public pro profile (PLAN step 5.11): port of web ContractorProfile (/contractors/:id).
// Reads the way web does: get_contractor_profile (the contact-free RPC; also lets an
// admin preview a pending pro), portfolio_items, get_contractor_reviews (SECURITY
// DEFINER, so the reviewer's first name resolves), contractor_price_grade.
//
// Three outcomes: a failed profile read is a DeadEnd with retry; a pro the read
// answered "nobody" for is a DeadEnd with no retry and a way home; and the three
// decoration reads (portfolio, reviews, price grade) flag their own failure, never
// a confident "no reviews". Works signed in (either role) and as a cold deep link.
// Left on the website: web's admin review panel (approve/deactivate, documents).
import React, { useCallback, useEffect, useState } from "react";
import { Image, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Button, Card, DashCard, DeadEnd, Group, Ic, Pill, Row, Screen, ScreenHeader, Sk, SkRow, Txt, notify, rgba, ui, useDelayed, useTheme, type PillTone } from "@/kit";
import { supabase } from "@/lib/supabase";
import { readAuthUser } from "@/lib/authRead";
import { gradeBlurb, gradeLabel, type Grade } from "@/lib/servicePricing";

type Read<T> = { kind: "ok"; value: T } | { kind: "error" };
type Loaded = {
  key: string;
  con: Read<any | null>;
  portfolio: Read<any[]>;
  reviews: Read<any[]>;
  grade: Read<Grade | null>;
  role: string | null;
  signedIn: boolean;
};

const SCORES: [string, string][] = [["Price", "price_score"], ["Experience", "experience_score"], ["Results", "result_score"]];
const GRADE_TONE: Record<string, PillTone> = { "A+": "good", A: "neutral", "A-": "warn" };

async function load(id: string): Promise<Omit<Loaded, "key">> {
  const bad = { kind: "error" } as const;
  try {
    // Hydrate the session BEFORE the reads (web does): a cold deep link must not
    // fire the RPC before the JWT is attached, or a pending pro looks "not found" to an admin.
    // readAuthUser() is the one "signed in?" test (review G5 round 2), and it hydrates too.
    const who = await readAuthUser();
    const uid = who.kind === "user" ? who.userId : null;
    const [con, pf, revs, pg, me] = await Promise.all([
      supabase.rpc("get_contractor_profile", { p_id: id }).maybeSingle(),
      supabase.from("portfolio_items").select("*").eq("contractor_id", id).order("created_at", { ascending: false }),
      supabase.rpc("get_contractor_reviews", { p_id: id }),
      supabase.rpc("contractor_price_grade", { p_contractor: id }).maybeSingle(),
      uid ? supabase.from("profiles").select("role").eq("id", uid).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    return {
      con: con.error ? bad : { kind: "ok", value: con.data ?? null },
      portfolio: pf.error ? bad : { kind: "ok", value: pf.data ?? [] },
      reviews: revs.error ? bad : { kind: "ok", value: Array.isArray(revs.data) ? revs.data : [] },
      grade: pg.error ? bad : { kind: "ok", value: ((pg.data as { grade?: string } | null)?.grade ?? null) as Grade | null },
      // The viewer's role only decides whether "Book" is offered; unreadable = unknown.
      role: me.error ? null : (me.data as { role?: string | null } | null)?.role ?? null,
      // "unknown" still offers Book: the new-request screen has its own couldn't-tell
      // screen with a retry, so a network blip doesn't silently hide the action.
      signedIn: who.kind !== "signedOut",
    };
  } catch {
    return { con: bad, portfolio: bad, reviews: bad, grade: bad, role: null, signedIn: false };
  }
}

export function ProProfileScreen() {
  const { t } = useTheme();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const showSkeleton = useDelayed();

  // Keyed read: a result only counts under the key it was read for, so a new id
  // or a retry reads as "loading" without a synchronous setState in the effect.
  const key = `${id}|${nonce}`;
  useEffect(() => {
    if (!id) return;
    let stale = false;
    void load(id).then((r) => { if (!stale) setLoaded({ key, ...r }); });
    return () => { stale = true; };
  }, [id, key]);
  const retry = useCallback(() => setNonce((n) => n + 1), []);

  const home = <Button onPress={() => router.replace("/")}>Go home</Button>;

  if (!id) return <DeadEnd msg="We couldn't find that contractor." retry={false} alt={home} />;
  const cur = loaded && loaded.key === key ? loaded : null;
  if (!cur) {
    return (
      <Screen>
        <ScreenHeader title="Contractor" />
        {showSkeleton ? (
          <View style={{ paddingTop: t.s6, gap: t.s4 }}>
            <View style={{ flexDirection: "row", gap: t.s4, alignItems: "center" }}>
              <Sk w={ui.photoTile} h={ui.photoTile} circle />
              <View style={{ flex: 1, gap: t.s2 }}><Sk w="52%" h={24} /><Sk w="34%" h={12} /></View>
            </View>
            <SkRow /><SkRow />
          </View>
        ) : null}
      </Screen>
    );
  }
  if (cur.con.kind === "error") {
    return <DeadEnd msg="We couldn't load this contractor. Check your connection, then try again." onRetry={retry} />;
  }
  const c = cur.con.value;
  if (!c) return <DeadEnd msg="We couldn't find that contractor." retry={false} alt={home} />;

  const reviews = cur.reviews.kind === "ok" ? cur.reviews.value : [];
  const portfolio = cur.portfolio.kind === "ok" ? cur.portfolio.value : [];
  const grade = cur.grade.kind === "ok" ? cur.grade.value : null;
  const avgScore = (k: string) => {
    const vals = reviews.map((r: any) => r[k]).filter((v: any) => v != null);
    return vals.length ? (vals.reduce((a: number, b: number) => a + b, 0) / vals.length).toFixed(1) : null;
  };
  const pfUrl = (path: string) => supabase.storage.from("portfolio-photos").getPublicUrl(path).data.publicUrl;
  // Web offers "Book" to every viewer. A signed-in contractor or admin can't book (the
  // request flow is the client's), so it is not offered to them; unknown role = offered.
  // Signed out: the new-request screen would send them to Welcome and drop the pro
  // (review G5 #4), so Book is offered only to a signed-in client or unknown role.
  const canBook = cur.signedIn && cur.role !== "contractor" && cur.role !== "admin";
  const marks: { icon: "user-check" | "check-circle" | "clipboard-list"; label: string; tone: PillTone }[] = [];
  if (c.id_verified) marks.push({ icon: "user-check", label: "ID verified", tone: "good" });
  if (c.insurance_on_file) marks.push({ icon: "check-circle", label: "Insurance on file", tone: "neutral" });
  if (c.wcb_on_file) marks.push({ icon: "clipboard-list", label: "WCB on file", tone: "neutral" });
  const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Contractor";

  return (
    <Screen onRefresh={async () => retry()}>
      <ScreenHeader title="Contractor" />
      <DashCard>
        <View style={{ flexDirection: "row", gap: t.s4, alignItems: "center" }}>
          <View style={{ width: ui.photoTile, height: ui.photoTile, borderRadius: ui.photoTile / 2, overflow: "hidden", backgroundColor: t.accentSoft, alignItems: "center", justifyContent: "center" }}>
            {c.photo_url
              ? <Image source={{ uri: c.photo_url }} accessibilityLabel={name} style={{ width: ui.photoTile, height: ui.photoTile }} />
              : <Ic name="user" size={ui.icon.xl} color={rgba(t.muted, 0.7)} />}
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="display" size={1.3} lh={1.2} accessibilityRole="header">{name}</Txt>
            {c.company_name ? <Txt size={0.9} color={rgba(t.muted, 0.8)}>{c.company_name}</Txt> : null}
          </View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s3, marginTop: t.s4 }}>
          {c.years_of_experience != null ? <Txt size={0.82} color={rgba(t.muted, 0.8)}>{`${c.years_of_experience} yrs exp`}</Txt> : null}
          {c.rating != null ? <Txt size={0.82} color={rgba(t.muted, 0.8)}>{`★ ${c.rating} rating`}</Txt> : null}
          {reviews.length > 0 ? <Txt size={0.82} color={rgba(t.muted, 0.8)}>{`${reviews.length} review${reviews.length !== 1 ? "s" : ""}`}</Txt> : null}
        </View>
        {grade ? (
          <View style={{ marginTop: t.s3, gap: t.s1 }}>
            <Pill tone={GRADE_TONE[grade] ?? "neutral"}>{`${grade} · ${gradeLabel(grade, "pro")}`}</Pill>
            <Txt size={0.78} color={rgba(t.muted, 0.7)}>{gradeBlurb(grade, "pro")}</Txt>
          </View>
        ) : null}
        {marks.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2, marginTop: t.s3 }}>
            {marks.map((m) => <Pill key={m.label} tone={m.tone}>{m.label}</Pill>)}
          </View>
        ) : null}
        {(c.specialties?.length ?? 0) > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2, marginTop: t.s3 }}>
            {c.specialties.map((sp: string) => <Pill key={sp}>{sp}</Pill>)}
          </View>
        ) : null}
        {(c.service_area?.length ?? 0) > 0 ? (
          <View style={{ flexDirection: "row", gap: t.s2, marginTop: t.s3, alignItems: "center" }}>
            <Ic name="map-pin" size={ui.icon.sm} color={rgba(t.muted, 0.7)} />
            <Txt size={0.82} color={rgba(t.muted, 0.7)} style={{ flex: 1 }}>{c.service_area.join(" · ")}</Txt>
          </View>
        ) : null}
        <View style={{ gap: t.s3, marginTop: t.s4 }}>
          {canBook ? <Button variant="primary" full onPress={() => router.push({ pathname: "/client/new-request", params: { pro: id } })}>Book this contractor</Button> : null}
          {c.google_reviews_url ? (
            <Button full onPress={() => { WebBrowser.openBrowserAsync(c.google_reviews_url).catch(() => notify("Couldn't open the link. Check your connection and try again.", "danger")); }}>Google reviews</Button>
          ) : null}
        </View>
      </DashCard>

      {cur.reviews.kind === "error" ? (
        <Card style={{ marginTop: t.s6 }}>
          <Row icon="alert-triangle" tone="warn" title="We couldn't load this contractor's reviews." sub="Tap to try again." onPress={retry} />
        </Card>
      ) : null}
      {cur.portfolio.kind === "error" ? (
        <Card style={{ marginTop: t.s6 }}>
          <Row icon="alert-triangle" tone="warn" title="We couldn't load this contractor's past work." sub="Tap to try again." onPress={retry} />
        </Card>
      ) : null}

      {reviews.length > 0 ? (
        <View style={{ flexDirection: "row", gap: t.s3, marginTop: t.s6 }}>
          {SCORES.map(([label, k]) => {
            const a = avgScore(k);
            return a ? (
              <View key={k} style={{ flex: 1, alignItems: "center", paddingVertical: t.s4, backgroundColor: t.cardBg, borderWidth: t.hairW, borderColor: t.cardBorder, borderRadius: t.r4 }}>
                <Txt variant="label" size={1.7}>{a}<Txt variant="label" size={1} color={rgba(t.muted, 0.6)}>/10</Txt></Txt>
                <Txt variant="label" size={0.72} color={rgba(t.muted, 0.7)}>{label}</Txt>
              </View>
            ) : null;
          })}
        </View>
      ) : null}

      {portfolio.length > 0 ? (
        <Group label="Past work">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s3 }}>
            {portfolio.map((item: any) => (
              <View key={item.id} style={{ width: "47%", flexGrow: 1, backgroundColor: t.cardBg, borderWidth: t.hairW, borderColor: t.cardBorder, borderRadius: t.r3, overflow: "hidden" }}>
                {item.photo_path ? <Image source={{ uri: pfUrl(item.photo_path) }} accessibilityLabel={item.title || "Past job"} style={{ width: "100%", height: ui.photoTile * 2 }} resizeMode="cover" /> : null}
                {item.title || item.description ? (
                  <View style={{ padding: t.s2, gap: t.s1 }}>
                    {item.title ? <Txt variant="bodyMedium" size={0.85}>{item.title}</Txt> : null}
                    {item.description ? <Txt size={0.78} color={rgba(t.muted, 0.7)}>{item.description}</Txt> : null}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </Group>
      ) : null}

      {reviews.length > 0 ? (
        <Group label="Client reviews">
          <Card>
            {reviews.map((r: any) => (
              <View key={r.id} style={{ padding: t.s4, gap: t.s2 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Txt variant="bodyMedium">{r.reviewer_first_name ?? "Client"}</Txt>
                  <Txt size={0.78} color={rgba(t.muted, 0.7)}>{new Date(r.created_at).toLocaleDateString()}</Txt>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2 }}>
                  {SCORES.map(([l, k]) => (r[k] != null ? <Pill key={k}>{`${l}: ${r[k]}/10`}</Pill> : null))}
                </View>
                {r.comment ? <Txt size={0.9} lh={1.6} color={rgba(t.muted, 0.9)}>{r.comment}</Txt> : null}
              </View>
            ))}
          </Card>
        </Group>
      ) : null}
    </Screen>
  );
}
