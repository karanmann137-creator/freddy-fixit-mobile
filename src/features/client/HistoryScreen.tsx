// History (PLAN step 4.16): past requests (completed or cancelled), from useClientData.
// No per-job read and no money here: receipts and yearly statements are the website's
// (web builds them from the job and payment records), so the app hands those off.
// Rating a finished job is in the app (step 4.13: ReviewScreen, same RPC as web).
import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Button, Card, DeadEnd, Group, Pill, Row, Screen, ScreenHeader, SkRow, Txt, rgba, useDelayed, useTheme, type IconName, type PillTone, type RowTone } from "@/kit";
import { useClientData } from "./data";
import { isPastRequest } from "./rules";
import { openOnWeb } from "./web";

const META: Record<string, { icon: IconName; label: string; tone: PillTone; rowTone: RowTone }> = {
  completed: { icon: "check-circle", label: "Completed", tone: "good", rowTone: "good" },
  cancelled: { icon: "x-circle", label: "Cancelled", tone: "danger", rowTone: "neutral" },
};
type Filter = "all" | "completed" | "cancelled";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" }, { key: "completed", label: "Completed" }, { key: "cancelled", label: "Cancelled" },
];
const PAGE = 5;

export function HistoryScreen() {
  const { t } = useTheme();
  const { state, reload } = useClientData();
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);
  const showSkeleton = useDelayed();

  if (state.kind === "error") {
    return <DeadEnd msg="We couldn't load your history. Check your connection, then try again." onRetry={() => void reload()} />;
  }
  if (state.kind === "loading") {
    return (
      <Screen>
        <ScreenHeader title="History" />
        {showSkeleton ? <View style={{ paddingTop: t.s6, gap: t.s4 }}><SkRow /><SkRow /><SkRow /></View> : null}
      </Screen>
    );
  }

  const past = state.data.requests.filter(isPastRequest);
  const filtered = past.filter((r) => filter === "all" || r.status === filter);
  const shown = filtered.slice(0, limit);

  return (
    <Screen onRefresh={reload}>
      <ScreenHeader title="History" />
      <Group label="Request history" action={<Txt size={0.8} color={rgba(t.muted, 0.7)}>{`${filtered.length} of ${past.length}`}</Txt>}>
        {past.length === 0 ? (
          <Card><Row icon="clock" tone="neutral" title="Nothing here yet" sub="Your finished and cancelled requests will show up here." /></Card>
        ) : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2, marginBottom: t.s3 }}>
              {FILTERS.map((f) => (
                <Button key={f.key} variant={filter === f.key ? "secondary" : "ghost"} accessibilityLabel={`Show ${f.label}`} onPress={() => { setFilter(f.key); setLimit(PAGE); }}>
                  {f.label}
                </Button>
              ))}
            </View>
            {shown.length === 0 ? (
              <Txt size={0.85} color={rgba(t.muted, 0.7)}>{`No ${filter} requests to show.`}</Txt>
            ) : (
              <Card>
                {shown.map((r) => {
                  const m = META[r.status];
                  return (
                    <Row
                      key={r.id}
                      icon={m?.icon ?? "clipboard-list"}
                      tone={m?.rowTone ?? "neutral"}
                      title={r.service_needed ?? "Request"}
                      sub={r.created_at ? new Date(r.created_at).toLocaleDateString("en-CA") : undefined}
                      right={<Pill tone={m?.tone ?? "neutral"}>{m?.label ?? String(r.status)}</Pill>}
                      // A finished job opens the rating screen (which also says if it is already rated).
                      chevron={r.status === "completed"}
                      onPress={r.status === "completed" ? () => router.push({ pathname: "/client/review/[requestId]", params: { requestId: r.id } }) : undefined}
                      accessibilityLabel={r.status === "completed" ? `${r.service_needed ?? "Request"}, completed. View and rate.` : undefined}
                    />
                  );
                })}
              </Card>
            )}
            {filtered.length > limit ? (
              <View style={{ marginTop: t.s3 }}>
                <Button full onPress={() => setLimit((l) => l + PAGE)}>{`Show more (${filtered.length - limit})`}</Button>
              </View>
            ) : null}
          </>
        )}
      </Group>

      <Group label="For your records">
        <Card>
          <Row icon="download" tone="neutral" title="Receipts and yearly statements"
            sub="Open them on freddyfixit.ca. Print or save as PDF." chevron onPress={() => openOnWeb("/client-dashboard")} />
        </Card>
      </Group>
    </Screen>
  );
}
