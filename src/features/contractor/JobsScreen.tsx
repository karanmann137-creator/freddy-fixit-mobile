// Jobs tab (PLAN 5.1 shell; the full tab with the attention chain is step 5.6,
// which needs W1). Lists the contractor's jobs and hands each one to the website
// until the job screen (5.7) exists. Three outcomes, like the client side.
import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Card, DeadEnd, Group, Hero, HeroSub, Pass, PassTop, Row, Screen, SkRow, StateLine, useDelayed, useTheme } from "@/kit";
import { formatWhen } from "@/features/client/rules";
import { openOnWeb } from "@/features/client/web";
import { useContractorData } from "./data";
import { CalendarView } from "./CalendarView";
import { Segmented } from "./Segmented";
import { contractorNav, contractorPass, jobStatusLabel, navCounts } from "./rules";

export function JobsScreen() {
  const { t } = useTheme();
  const { state, reload } = useContractorData();
  const showSkeleton = useDelayed();
  const [mode, setMode] = useState<"list" | "calendar">("list");
  if (state.kind === "error") return <DeadEnd msg="We couldn't load your jobs. Check your connection, then try again." onRetry={() => void reload()} />;
  if (state.kind === "loading") {
    return <Screen>{showSkeleton ? <View style={{ paddingTop: t.s6, gap: t.s4 }}><SkRow /><SkRow /><SkRow /></View> : null}</Screen>;
  }
  const d = state.data;
  const pass = contractorPass(d);
  const nav = contractorNav(navCounts(d));
  // Calendar only exists while a job has a booked time (web visibleNav); otherwise the list.
  const showCalendar = nav.calendar && mode === "calendar";
  const current = d.jobs.filter((j) => j.status !== "completed" && j.status !== "cancelled");
  return (
    <Screen edges={["left", "right"]} contentStyle={{ paddingHorizontal: 0 }} onRefresh={reload}>
      <Pass>
        <PassTop />
        <View style={{ marginTop: t.s4 }}><StateLine state={pass.state}>{pass.label}</StateLine></View>
        <Hero>{pass.hero}</Hero>
        {pass.sub ? <HeroSub>{pass.sub}</HeroSub> : null}
      </Pass>
      <View style={{ paddingHorizontal: t.s4 }}>
        {nav.calendar ? (
          <View style={{ marginTop: t.s5 }}>
            <Segmented label="Jobs view" value={showCalendar ? "calendar" : "list"} onChange={setMode}
              options={[{ value: "list", label: "List" }, { value: "calendar", label: "Calendar" }]} />
          </View>
        ) : null}
        {showCalendar ? <CalendarView jobs={d.jobs} /> : current.length > 0 ? (
          <Group label="Your jobs">
            <Card>
              {current.map((j) => (
                <Row key={j.id} icon="briefcase" tone="neutral"
                  title={(j.request?.service_needed ?? "Job") + (j.client?.first_name ? " · " + j.client.first_name : "")}
                  sub={jobStatusLabel(j) + (j.scheduled_at ? " · " + formatWhen(j.scheduled_at) : "")}
                  chevron onPress={() => openOnWeb("/contractor-dashboard")} />
              ))}
            </Card>
          </Group>
        ) : (
          <Card style={{ marginTop: t.s5 }}>
            <Row icon="search" tone="neutral" title="Find your next job" sub="Open requests in your area are under Available." chevron onPress={() => router.push("/contractor/available")} />
          </Card>
        )}
        {nav.reviews ? (
          <Group label="More">
            <Card>
              <Row icon="star" tone="neutral" title="Reviews" sub={d.reviewsFailed ? "Couldn't load: tap to try again" : String(d.reviews.length)} chevron onPress={() => router.push("/contractor/reviews")} />
            </Card>
          </Group>
        ) : null}
      </View>
    </Screen>
  );
}
