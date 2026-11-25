// Available tab (PLAN step 5.5): port of web contractor/ContractorAvailableTab.tsx.
//
// The list is list_open_jobs() in the SERVER'S order. The server ranks (the
// client's preferred pro first, then in-zone, then fewest bids, then newest) and
// it alone decides what is open to this pro. Zone ranking is never a filter:
// nothing here sorts, drops or re-orders a row. The only client-side narrowing is
// web's search box, which the pro types into themselves.
//
// Three outcomes: a failed read is "couldn't load" + retry, never "no open jobs".
// A contractor who isn't approved sees web's under-review panel, not a list or a
// dead button (place_bid refuses a non-active account, and list_open_jobs returns
// nothing to one).
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, DeadEnd, Field, Ic, Screen, ScreenHeader, SkRow, Txt, rgba, ui, useDelayed, useTheme } from "@/kit";
import { matchesSearch, searchTokens } from "@/lib/dashSearch";
import { useServicePricing, type ServicePrice } from "@/lib/servicePricing";
import { openOnWeb } from "@/features/client/web";
import { LinkButton } from "@/features/request/pieces";
import { useContractorData } from "./data";
import { openJobSearchFields, type OpenJob } from "./bid";
import { BidCount, BudgetBox, JobBadges, JobHead, JobText, MyBidLine } from "./OpenJobParts";

export function AvailableScreen() {
  const { t } = useTheme();
  const { state, reload } = useContractorData();
  const pricing = useServicePricing();
  const [search, setSearch] = useState("");
  const showSkeleton = useDelayed();

  if (state.kind === "error") {
    return <DeadEnd msg="We couldn't load open jobs. Check your connection, then try again." onRetry={() => void reload()} />;
  }
  if (state.kind === "loading") {
    return (
      <Screen>
        <ScreenHeader title="Available" back={false} />
        {showSkeleton ? <View style={{ paddingTop: t.s4, gap: t.s4 }}><SkRow /><SkRow /><SkRow /></View> : null}
      </Screen>
    );
  }
  const d = state.data;

  if (d.contractor?.status !== "active") {
    return (
      <Screen onRefresh={reload}>
        <ScreenHeader title="Available" back={false} />
        <Blank icon="clock" title="Your Profile Is Under Review"
          body="Available jobs open up once our team approves your account. Make sure your profile and documents are complete so we can review you faster — you'll get an email the moment you're approved." />
        {/* The profile tab is step 5.4; until it lands the website has it. */}
        <View style={{ marginTop: t.s5, alignItems: "center" }}>
          <Button variant="primary" onPress={() => openOnWeb("/contractor-dashboard?tab=profile")}>Complete my profile</Button>
        </View>
      </Screen>
    );
  }

  const jobs = d.openJobs as OpenJob[];
  const tokens = searchTokens(search);
  const hits = jobs.filter((r) => matchesSearch(tokens, openJobSearchFields(r)));

  return (
    <Screen onRefresh={reload}>
      <ScreenHeader title="Available" back={false} />
      <Txt size={0.82} color={rgba(t.muted, 0.6)}>Open jobs that match your trades — lowest-competition first.</Txt>
      {jobs.length > 3 ? (
        <Field label="Search open jobs" placeholder="Search open jobs — service or area" value={search} onChangeText={setSearch}
          autoCorrect={false} returnKeyType="search" hint={hits.length + " of " + jobs.length + " shown"} />
      ) : null}

      {jobs.length > 0 && hits.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: t.s8, gap: t.s2 }}>
          <Txt size={0.9} color={rgba(t.muted, 0.7)} style={{ textAlign: "center" }}>{"No open jobs match “" + search + "”."}</Txt>
          <LinkButton onPress={() => setSearch("")}>Clear search</LinkButton>
        </View>
      ) : jobs.length === 0 ? (
        <>
          <Blank icon="clipboard-list" title="No Open Jobs Right Now"
            body="New jobs matching your specialties will show up here. Add more specialties in your profile to see more work." />
          <View style={{ marginTop: t.s5, alignItems: "center" }}>
            <Button onPress={() => openOnWeb("/contractor-dashboard?tab=profile")}>Update your specialties</Button>
          </View>
        </>
      ) : (
        hits.map((r) => <JobCard key={r.id} r={r} pricing={pricing} />)
      )}
    </Screen>
  );
}

function Blank({ icon, title, body }: { icon: "clock" | "clipboard-list"; title: string; body: string }) {
  const { t } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingTop: t.s10, paddingHorizontal: t.s4, gap: t.s3 }}>
      <Ic name={icon} size={ui.icon.xl * 2.4} color={rgba(t.muted, 0.7)} />
      <Txt variant="label" size={1.5} style={{ textAlign: "center" }} accessibilityRole="header">{title}</Txt>
      <Txt lh={1.6} color={rgba(t.muted, 0.7)} style={{ textAlign: "center", maxWidth: ui.readMax }}>{body}</Txt>
    </View>
  );
}

/** One web job card, condensed: the whole card opens the job, where the bid form and "hide" live. */
function JobCard({ r, pricing }: { r: OpenJob; pricing: Record<string, ServicePrice> }) {
  const { t } = useTheme();
  return (
    <Pressable onPress={() => router.push({ pathname: "/contractor/open/[id]", params: { id: r.id } })}
      accessibilityRole="button" accessibilityLabel={(r.service_needed ?? "Job") + (r.location ? ", " + r.location : "") + ". Open to bid."}
      style={({ pressed }) => ({ marginTop: t.s4, opacity: pressed ? 0.85 : 1 })}>
      <Card>
        <View style={{ padding: t.s4, gap: t.s3 }}>
          <JobBadges r={r} />
          <JobHead r={r} pricing={pricing} />
          <BudgetBox r={r} pricing={pricing} />
          <JobText text={r.job_description} lines={4} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.s3, minHeight: t.hCtl, borderTopWidth: t.hairW, borderTopColor: t.hair, paddingTop: t.s2 }}>
            <MyBidLine r={r} />
            <BidCount r={r} />
            <Ic name="chevron-down" size={ui.icon.lg} rotate={-90} color={rgba(t.muted, 0.6)} />
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
