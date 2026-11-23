// Dev-only twin of web /ui-lab: every kit primitive against the real tokens,
// with a dark/light flip and the text-size steps. Never reachable in production
// (index.tsx renders it only under __DEV__).
import React, { useState } from "react";
import { View } from "react-native";
import {
  askConfirm, AttentionCard, Button, ButtonRow, Card, DashCard, Group, Hero, HeroSub, Ic, IconButton, JobSwitcher, notify, Pass, PassMeta,
  PassMetaItem, PassTop, Pill, Row, Screen, SkRow, Stack, StateLine, Stepper, TrustLine, Txt, useTheme,
} from "@/kit";
import { glyphs, type IconName } from "@/kit/glyphs.generated";
import { getTheme, setTheme, setTextScale, TEXT_SCALES, SCALE_LABELS } from "@/lib/theme";

export function KitLab() {
  const { t, scale } = useTheme();
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState("a");
  return (
    <Screen onRefresh={() => new Promise((r) => setTimeout(r, 600))}>
      <Txt variant="label" size={2} style={{ marginTop: t.s6 }}>Kit lab</Txt>
      <Txt color={t.ink3}>Dev build only. Pull down to test refresh.</Txt>

      <ButtonRow>
        <Button onPress={() => setTheme(getTheme() === "dark" ? "light" : "dark")}>Flip theme</Button>
        <Button onPress={() => {
          const i = (TEXT_SCALES as readonly number[]).indexOf(scale);
          setTextScale(TEXT_SCALES[(i + 1) % TEXT_SCALES.length]);
        }}>{`Text: ${SCALE_LABELS[scale]}`}</Button>
      </ButtonRow>

      <Group label="Pass">
        <View style={{ marginHorizontal: -t.s4, borderRadius: t.r4, overflow: "hidden" }}>
          <Pass>
            <PassTop><IconButton label="Notifications" badge={3}><Ic name="bell" size={18} /></IconButton></PassTop>
            <Hero>Your fence repair is booked</Hero>
            <HeroSub>Mike arrives Tuesday between 10 and 12.</HeroSub>
            <PassMeta>
              <PassMetaItem label="JOB" value="FFX-1042" />
              <PassMetaItem label="DUE NOW" value="$120.00" accent />
            </PassMeta>
          </Pass>
        </View>
      </Group>

      <Group label="Job switcher">
        <JobSwitcher activeId={job} onSelect={setJob} onNew={() => notify("New request tapped", "neutral")}
          jobs={[{ id: "a", label: "FENCE", state: "turn" }, { id: "b", label: "DECK", state: "wait" }, { id: "c", label: "FAUCET", state: "ok" }]} />
      </Group>

      <AttentionCard>
        <Row icon="dollar" title="Pay the deposit" sub="Your pro starts once it's held securely" chevron onPress={() => {}} />
        <Row icon="calendar" title="Pick a visit time" chevron onPress={() => {}} />
      </AttentionCard>
      <TrustLine>Your money is held securely until you confirm the job is done.</TrustLine>

      <Group label="Stepper">
        <Card>
          <Stepper steps={[
            { title: "Request posted", sub: "Nov 18", state: "done" },
            { title: "Pro picked", sub: "Mike R.", state: "done" },
            { title: "Deposit", sub: "Waiting on you", state: "now" },
            { title: "Work done", state: "todo" },
          ]} />
        </Card>
      </Group>

      <Group label="Confirm + toast">
        <Stack>
          <Button full onPress={async () => {
            const ok = await askConfirm({ title: "Delete this request?", message: "Pros who quoted will be told it's closed. This can't be undone.", confirmLabel: "Delete" });
            notify(ok ? "Confirmed" : "Cancelled", ok ? "good" : "neutral");
          }}>Ask confirm (danger)</Button>
          <Button full onPress={() => notify("Saved")}>Toast</Button>
        </Stack>
      </Group>

      <Group label="Skeleton">
        <Card><SkRow /><SkRow /></Card>
      </Group>

      <Group label="State line">
        <StateLine state="turn" pulse>Your turn: pay the deposit</StateLine>
        <StateLine state="wait">Waiting on your pro</StateLine>
        <StateLine state="ok">Paid in full</StateLine>
        <StateLine state="review">{"We're reviewing this"}</StateLine>
      </Group>

      <Group label="Buttons">
        <Stack>
          <Button variant="primary" full loading={busy} onPress={() => { setBusy(true); setTimeout(() => setBusy(false), 1200); }}>Primary (tap to load)</Button>
          <Button full>Secondary</Button>
          <Button variant="ghost" full>Ghost</Button>
          <Button variant="danger" full>Danger</Button>
          <Button full disabled>Disabled</Button>
        </Stack>
      </Group>

      <Group label="Pills">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s2 }}>
          <Pill tone="accent">NEEDS YOU</Pill><Pill tone="good">PAID</Pill><Pill tone="warn">IN REVIEW</Pill>
          <Pill tone="danger">DECLINED</Pill><Pill>NEUTRAL</Pill>
        </View>
      </Group>

      <Group label="Card + rows" action={<Txt variant="label" size={0.78} color={t.ink3}>ACTION</Txt>}>
        <Card>
          <Row icon="calendar" title="Visit booked" sub="Tue, 10:00 AM" chevron onPress={() => {}} />
          <Row icon="dollar" tone="good" title="Deposit" sub="Held securely" amount="$120.00" />
          <Row icon="alert-triangle" tone="warn" title="Price change proposed" right="NEW" chevron onPress={() => {}} />
          <Row tone="neutral" title="No icon: still aligned" sub="The gut renders empty" />
        </Card>
      </Group>

      <Group label={`Icons (${Object.keys(glyphs).length})`}>
        <DashCard>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s3 }}>
            {(Object.keys(glyphs) as IconName[]).map((n) => <Ic key={n} name={n} size={22} />)}
          </View>
        </DashCard>
      </Group>
    </Screen>
  );
}
