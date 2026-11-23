// Reviews (PLAN step 5.10): port of web ContractorReviewsTab. Data is the dashboard's
// `reviews` read (useContractorData). That read is decoration-only upstream, so a
// failure arrives as `reviewsFailed`: it must say "couldn't load" with a retry and
// NEVER "No reviews yet" (a confident zero for someone who has reviews).
import React from "react";
import { View } from "react-native";
import { Button, Card, DashCard, DeadEnd, Ic, Pill, Row, Screen, ScreenHeader, SkRow, Txt, rgba, ui, useDelayed, useTheme, type PillTone } from "@/kit";
import { useContractorData } from "./data";

// Web shared.ts scoreTone.
const scoreTone = (v: number): PillTone => (v >= 8 ? "good" : v >= 5 ? "neutral" : "warn");

const SCORES: [string, string][] = [["Price", "price_score"], ["Experience", "experience_score"], ["Results", "result_score"]];

export function ReviewsScreen() {
  const { t } = useTheme();
  const { state, reload } = useContractorData();
  const showSkeleton = useDelayed();

  if (state.kind === "error") {
    return <DeadEnd msg="We couldn't load your reviews. Check your connection, then try again." onRetry={() => void reload()} />;
  }
  if (state.kind === "loading") {
    return (
      <Screen>
        <ScreenHeader title="Reviews" />
        {showSkeleton ? <View style={{ paddingTop: t.s6, gap: t.s4 }}><SkRow /><SkRow /></View> : null}
      </Screen>
    );
  }
  const d = state.data;
  const reviews: any[] = d.reviews;

  // Web: sum of (score ?? 0) over ALL reviews / count, so a missing score counts as 0.
  const avg = (key: string) => reviews.reduce((a, r) => a + (r[key] ?? 0), 0) / reviews.length || 0;
  const avgColor = (v: number) => (v >= 8 ? t.success : v >= 5 ? t.text : t.warn);

  return (
    <Screen onRefresh={reload}>
      <ScreenHeader title="Reviews" />
      {d.reviewsFailed ? (
        <View style={{ marginTop: t.s6, gap: t.s3 }}>
          <Card>
            <Row icon="alert-triangle" tone="warn" title="We couldn't load your reviews." sub="Your reviews are safe. We just couldn't read them." />
          </Card>
          <Button onPress={() => void reload()}>Try again</Button>
        </View>
      ) : reviews.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: t.s10, paddingHorizontal: t.s4, gap: t.s3 }}>
          <Ic name="star" size={ui.icon.xl} color={rgba(t.muted, 0.5)} />
          <Txt variant="label" size={1.5}>No reviews yet</Txt>
          <Txt color={rgba(t.muted, 0.7)} style={{ textAlign: "center" }}>Reviews from clients appear here after jobs are completed.</Txt>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: t.s3, marginTop: t.s6 }}>
            {SCORES.map(([label, key]) => {
              const a = avg(key);
              return (
                <View key={key} style={{ flex: 1, alignItems: "center", paddingVertical: t.s4, backgroundColor: t.cardBg, borderWidth: t.hairW, borderColor: t.cardBorder, borderRadius: t.r4 }}>
                  <Txt variant="label" size={1.7} color={avgColor(a)}>{a.toFixed(1)}<Txt variant="label" size={1} color={rgba(t.muted, 0.6)}>/10</Txt></Txt>
                  <Txt variant="label" size={0.72} color={rgba(t.muted, 0.7)}>{label}</Txt>
                </View>
              );
            })}
          </View>
          {reviews.map((r) => (
            <DashCard key={r.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: t.s3 }}>
                <Txt variant="bodyMedium">{r.client?.first_name ?? "Client"}</Txt>
                <Txt size={0.78} color={rgba(t.muted, 0.7)}>{new Date(r.created_at).toLocaleDateString()}</Txt>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2, marginBottom: r.comment ? t.s3 : 0 }}>
                {SCORES.map(([l, key]) => (r[key] != null ? <Pill key={key} tone={scoreTone(Number(r[key]))}>{`${l}: ${r[key]}/10`}</Pill> : null))}
              </View>
              {r.comment ? <Txt size={0.9} lh={1.6} color={rgba(t.muted, 0.9)}>{r.comment}</Txt> : null}
            </DashCard>
          ))}
        </>
      )}
    </Screen>
  );
}
