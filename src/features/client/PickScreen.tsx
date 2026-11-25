// Pick-your-pro link (PLAN step 4.6): port of web pages/PickPro.tsx (/pick/:token).
//
// The token in the link (client_requests.pick_token) is the authorization for the
// READ: get_bids_by_token scopes it to one request and carries no email, phone or
// address, so this works signed out and as a cold deep link, exactly like web.
//
// ⚠️ OWNERSHIP IS PROVED BY COMPARING user_id, NOT BY RLS VISIBILITY (web CLAUDE.md,
// 2026-11-09). A signed-in visitor's select on client_requests returns a row for
// every token when their role has blanket access (the admin's FOR ALL policy), so
// "I can see the row" never means "it is mine". Only the signed-in id equal to the
// row's user_id sends the visitor to their own Requests tab. Anyone else (a pro,
// the admin, a forwarded link, a failed read) keeps this page.
//
// THE TOKEN IS NEVER EXCHANGED FOR A SESSION (web). Signed out, nothing is routed
// through sign-in: the page is useful without an account, and sign-in would drop
// the token. The decision itself (accept_bid_by_token) is step 4.5 and needs W1, so
// "Choose" hands the SAME /pick/<token> URL (plus ?bid=) to the website. It never
// accepts anything from the app, and `?bid=` only outlines that pro's card (web:
// a link in an email must not award a job).
//
// Three outcomes everywhere: a failed read is "couldn't load" + retry; a link the
// server doesn't know or that is spent is a refusal (retry={false}) with a way on.
import React, { useCallback, useEffect, useState } from "react";
import { Image, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Card, DashCard, DeadEnd, Group, Ic, Pill, Row, Screen, ScreenHeader, SkRow, Txt, rgba, ui, useDelayed, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { readAuthUser } from "@/lib/authRead";
import { openOnWeb } from "./web";

type Bid = {
  bid_id: string; company?: string | null; name?: string | null; photo_url?: string | null;
  amount?: number | null; price_low?: number | null; price_high?: number | null;
  rating?: number | null; rating_count?: number | null; total_jobs?: number | null; years?: number | null;
  walkthrough?: boolean | null; message?: string | null;
};
type Payload = { found?: boolean; already_matched?: boolean; client_first?: string | null; service?: string | null; description?: string | null; bids?: Bid[] };
type Outcome = { kind: "owner" } | { kind: "ok"; data: Payload | null } | { kind: "error" };

async function load(token: string): Promise<Outcome> {
  try {
    const who = await readAuthUser();
    if (who.kind === "unknown") return { kind: "error" }; // couldn't tell who is looking: never guess
    if (who.kind === "user") {
      const own = await supabase.from("client_requests").select("id, user_id").eq("pick_token", token).maybeSingle();
      // A failed read is not proof of ownership: it falls through to the pick page, as web.
      if (!own.error && own.data?.user_id && own.data.user_id === who.userId) return { kind: "owner" };
    }
    const { data, error } = await supabase.rpc("get_bids_by_token", { p_token: token });
    if (error) return { kind: "error" };
    return { kind: "ok", data: (data as Payload | null) ?? null };
  } catch {
    return { kind: "error" };
  }
}

const who = (b: Bid) => b.company || b.name || "Your pro";
function priceLine(b: Bid): string {
  if (b.amount != null) return "$" + b.amount;
  if (b.price_low != null && b.price_high != null) return "$" + b.price_low + "–$" + b.price_high;
  return "Estimate on request";
}

export function PickScreen() {
  const { t } = useTheme();
  const params = useLocalSearchParams<{ token?: string | string[]; bid?: string | string[] }>();
  const token = (Array.isArray(params.token) ? params.token[0] : params.token) ?? "";
  const focusBid = (Array.isArray(params.bid) ? params.bid[0] : params.bid) ?? "";
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; out: Outcome } | null>(null);
  const showSkeleton = useDelayed();

  // Keyed read: a result only counts under the key it was read for.
  const key = `${token}|${nonce}`;
  useEffect(() => {
    if (!token) return;
    let stale = false;
    void load(token).then((out) => {
      if (stale) return;
      if (out.kind === "owner") { router.replace("/client"); return; }
      setLoaded({ key, out });
    });
    return () => { stale = true; };
  }, [token, key]);
  const retry = useCallback(() => setNonce((n) => n + 1), []);

  const home = <Button onPress={() => router.replace("/")}>Open my dashboard</Button>;

  if (!token) return <DeadEnd msg="This link doesn't look right. Check that you copied the whole link from your email, or open your dashboard to see your estimates." retry={false} alt={home} />;
  const cur = loaded && loaded.key === key ? loaded.out : null;
  if (!cur || cur.kind === "owner") {
    return (
      <Screen>
        <ScreenHeader title="Choose your pro" />
        {showSkeleton ? <View style={{ paddingTop: t.s6, gap: t.s4 }}><SkRow /><SkRow /><SkRow /></View> : null}
      </Screen>
    );
  }
  if (cur.kind === "error") {
    return <DeadEnd msg="We couldn't load your estimates. This is on us, not you: they're safe. Check your connection, then try again." onRetry={retry} alt={home} />;
  }
  const d = cur.data;
  if (!d || d.found === false) {
    return <DeadEnd msg="This link has expired. It may have already been used, or the request was closed. Log in to see where things stand." retry={false} alt={home} />;
  }
  if (d.already_matched) {
    return (
      <Screen>
        <ScreenHeader title="Choose your pro" />
        <Card style={{ marginTop: t.s6 }}>
          <Row icon="check-circle" tone="good" title="You've already chosen a pro" sub="Your job is under way. Open your dashboard to message them or see what's next." />
        </Card>
        <View style={{ marginTop: t.s4 }}>{home}</View>
      </Screen>
    );
  }

  const bids = d.bids ?? [];
  return (
    <Screen onRefresh={async () => retry()}>
      <ScreenHeader title="Choose your pro" />
      <Txt variant="display" size={1.5} lh={1.15} accessibilityRole="header" style={{ marginTop: t.s4 }}>
        {d.client_first ? `${d.client_first}, pick your pro` : "Pick your pro"}
      </Txt>
      <Txt size={0.92} lh={1.5} color={rgba(t.muted, 0.8)} style={{ marginTop: t.s2 }}>
        {bids.length > 0 ? "Choosing opens the Freddy Fix It website, where you confirm it with one tap." : "Your request is live with Calgary pros right now."}
      </Txt>

      <Group label="Your request">
        <Card style={{ padding: t.s4, gap: t.s2 }}>
          <Txt variant="bodyBold">{d.service ?? "Request"}</Txt>
          {d.description ? <Txt size={0.88} lh={1.5} color={rgba(t.muted, 0.8)}>{d.description}</Txt> : null}
        </Card>
      </Group>

      {bids.length === 0 ? (
        <Card style={{ marginTop: t.s4 }}>
          <Row icon="clock" tone="neutral" title="Estimates are on their way" sub="Pros are reviewing your job now. We'll email you the moment the first one lands. Keep this link: it shows them here." />
        </Card>
      ) : (
        <Group label="Estimates">
          <View style={{ gap: t.s4 }}>
            {bids.map((b) => {
              const focused = !!focusBid && focusBid === String(b.bid_id);
              const name = who(b);
              return (
                <DashCard key={b.bid_id} style={focused ? { borderColor: t.accentLine } : undefined}>
                  <View style={{ flexDirection: "row", gap: t.s3, alignItems: "flex-start" }}>
                    <View style={{ width: t.hCtl, height: t.hCtl, borderRadius: ui.pill, overflow: "hidden", backgroundColor: t.accentSoft, alignItems: "center", justifyContent: "center" }}>
                      {b.photo_url
                        ? <Image source={{ uri: b.photo_url }} accessibilityLabel={name} style={{ width: "100%", height: "100%" }} />
                        : <Ic name="user" size={ui.icon.xl} color={rgba(t.muted, 0.7)} />}
                    </View>
                    <View style={{ flex: 1, gap: t.s2 }}>
                      <Txt variant="bodyBold">{name}</Txt>
                      <Txt variant="label" size={1.2} color={t.text}>{priceLine(b)}</Txt>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2 }}>
                        {b.rating != null && Number(b.rating_count) > 0 ? <Pill>{`★ ${Number(b.rating).toFixed(1)}/10 (${b.rating_count})`}</Pill> : null}
                        {Number(b.total_jobs) > 0 ? <Pill>{`${b.total_jobs} job${Number(b.total_jobs) === 1 ? "" : "s"} done`}</Pill> : null}
                        {Number(b.years) > 0 ? <Pill>{`${b.years} yr${Number(b.years) === 1 ? "" : "s"} experience`}</Pill> : null}
                        <Pill tone="good">Vetted</Pill>
                      </View>
                      {b.walkthrough ? (
                        <Txt size={0.82} lh={1.5} color={rgba(t.muted, 0.8)}>
                          Wants to see the space before giving a firm price. The range above is their ballpark: the visit is free, and you approve the exact price afterwards.
                        </Txt>
                      ) : null}
                      {b.message ? <Txt size={0.86} lh={1.5} color={rgba(t.muted, 0.85)}>{`“${b.message}”`}</Txt> : null}
                    </View>
                  </View>
                  <View style={{ marginTop: t.s4 }}>
                    <Button full accessibilityLabel={`Choose ${name} on the website`}
                      onPress={() => openOnWeb(`/pick/${encodeURIComponent(token)}?bid=${encodeURIComponent(String(b.bid_id))}`)}>
                      {`Choose ${name}`}
                    </Button>
                  </View>
                </DashCard>
              );
            })}
          </View>
          <Txt size={0.8} lh={1.6} color={rgba(t.muted, 0.7)} style={{ textAlign: "center", marginTop: t.s5 }}>
            {"Choosing a pro doesn't charge you anything. You'll approve the time and the final price before any payment, and your address is only shared with the pro you pick."}
          </Txt>
        </Group>
      )}
    </Screen>
  );
}
