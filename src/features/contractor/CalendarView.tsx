// Calendar toggle inside the Jobs tab (PLAN 5.8). Port of web JobsCalendar.tsx:
// a month grid of the contractor's booked jobs and the selected day's visits, all
// in Calgary time (calendarRules.ts). No reads of its own: it plots the jobs
// useContractorData already loaded. Tapping a visit opens the in-app job screen
// (web JobsCalendar onOpen: the same job card the list opens).
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Card, Group, Ic, Row, Txt, rgba, ui, useTheme } from "@/kit";
import { money } from "@/lib/servicePricing";
import { bucketByDay, calgaryToday, dayLabel, keyOf, monthCells, monthLabel, shiftMonth, statusWords, timeLabel, unscheduledCount, type YM } from "./calendarRules";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function MonthButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={{ minHeight: t.hCtl, minWidth: t.hCtl, alignItems: "center", justifyContent: "center", paddingHorizontal: t.s3, borderRadius: t.r3, borderWidth: t.hairW, borderColor: t.hair, backgroundColor: rgba(t.fg, 0.04) }}>
      {children}
    </Pressable>
  );
}

export function CalendarView({ jobs, onOpen }: { jobs: any[]; onOpen: (jobId: string) => void }) {
  const { t } = useTheme();
  // Read Calgary's date on every render, so a screen left open past midnight
  // marks and jumps to the real today (CodeRabbit #8).
  const today = calgaryToday();
  const [initial] = useState(() => calgaryToday());
  const [cur, setCur] = useState<YM>(initial.ym);
  const [selected, setSelected] = useState(initial.key);

  const byDay = bucketByDay(jobs);
  const unscheduled = unscheduledCount(jobs);
  const cells = monthCells(cur);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  // Status colours: tokens only (web paints eight hexes; the app has no hex literals).
  const dot = (status: string) => ({ assigned: t.warn, pending_confirmation: t.warn, scheduled: t.info, in_progress: t.success, disputed: t.danger } as Record<string, string>)[status] ?? rgba(t.muted, 0.7);

  const monthPrefix = keyOf(cur.y, cur.m, 1).slice(0, 7);
  const monthStatuses = Array.from(new Set(Object.keys(byDay).filter((k) => k.startsWith(monthPrefix)).flatMap((k) => byDay[k].map((j) => String(j.status)))));
  const selJobs = byDay[selected] ?? [];

  return (
    <View style={{ marginTop: t.s5 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.s2, marginBottom: t.s3 }}>
        <Txt variant="label" size={1.3} style={{ flex: 1 }} accessibilityRole="header">{monthLabel(cur)}</Txt>
        <MonthButton label="Previous month" onPress={() => setCur(shiftMonth(cur, -1))}><Ic name="chevron-down" size={ui.icon.lg} rotate={90} /></MonthButton>
        <MonthButton label="Go to today" onPress={() => { setCur(today.ym); setSelected(today.key); }}><Txt variant="bodyMedium" size={0.88}>Today</Txt></MonthButton>
        <MonthButton label="Next month" onPress={() => setCur(shiftMonth(cur, 1))}><Ic name="chevron-down" size={ui.icon.lg} rotate={-90} /></MonthButton>
      </View>

      {unscheduled > 0 ? (
        <View style={{ flexDirection: "row", gap: t.s2, marginBottom: t.s3 }}>
          <Ic name="alert-triangle" size={ui.icon.sm} color={t.warn} />
          <Txt size={0.82} color={rgba(t.muted, 0.9)} style={{ flex: 1 }}>
            {(unscheduled === 1 ? "1 active job has" : unscheduled + " active jobs have") + " no booked time yet. Propose a time on the job to see " + (unscheduled === 1 ? "it" : "them") + " here."}
          </Txt>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: t.s1, marginBottom: t.s1 }}>
        {WEEKDAYS.map((w) => (
          <View key={w} style={{ flex: 1, minWidth: 0, alignItems: "center", paddingVertical: t.s1 }}>
            <Txt variant="label" size={0.7} color={rgba(t.muted, 0.7)} numberOfLines={1}>{w}</Txt>
          </View>
        ))}
      </View>
      <View style={{ gap: t.s1 }}>
        {weeks.map((wk, wi) => (
          <View key={wi} style={{ flexDirection: "row", gap: t.s1 }}>
            {wk.map((d, i) => {
              if (d == null) return <View key={"e" + i} style={{ flex: 1, minWidth: 0, minHeight: t.hCtl, borderRadius: t.r2, backgroundColor: rgba(t.fg, 0.015) }} />;
              const k = keyOf(cur.y, cur.m, d);
              const dj = byDay[k] ?? [];
              const isToday = k === today.key, isSel = k === selected;
              return (
                <Pressable key={k} onPress={() => setSelected(k)} accessibilityRole="button" accessibilityState={{ selected: isSel }}
                  // Seven columns can be under 48dp wide on a 360dp phone: hitSlop keeps
                  // the touch area at 48dp without changing the grid (CodeRabbit #8).
                  hitSlop={{ left: t.s1, right: t.s1 }}
                  accessibilityLabel={dayLabel(k) + (isToday ? ", today" : "") + (dj.length ? ", " + dj.length + (dj.length === 1 ? " job" : " jobs") : ", nothing booked")}
                  style={{ flex: 1, minWidth: 0, minHeight: t.hCtl, alignItems: "center", justifyContent: "center", gap: t.s1, paddingVertical: t.s1, borderRadius: t.r2,
                    backgroundColor: isSel ? rgba(t.fg, 0.1) : rgba(t.fg, 0.035),
                    borderWidth: isToday || isSel ? ui.line : t.hairW, borderColor: isToday ? t.text : isSel ? t.hair : rgba(t.fg, 0.05) }}>
                  <Txt variant={isToday ? "bodyBold" : "bodyMedium"} size={0.85} color={isToday ? t.text : rgba(t.muted, 0.95)}>{d}</Txt>
                  <View style={{ flexDirection: "row", gap: ui.nudge2, height: ui.switcherDot }}>
                    {dj.slice(0, 3).map((j) => <View key={j.id} style={{ width: ui.switcherDot, height: ui.switcherDot, borderRadius: ui.pill, backgroundColor: dot(String(j.status)) }} />)}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {monthStatuses.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.s3, marginTop: t.s3 }}>
          {monthStatuses.map((st) => (
            <View key={st} style={{ flexDirection: "row", alignItems: "center", gap: t.s1 }}>
              <View style={{ width: ui.switcherDot, height: ui.switcherDot, borderRadius: ui.pill, backgroundColor: dot(st) }} />
              <Txt size={0.75} color={rgba(t.muted, 0.85)}>{statusWords(st)}</Txt>
            </View>
          ))}
        </View>
      ) : null}

      <Group label={dayLabel(selected)}>
        {selJobs.length === 0 ? (
          <Card><Row icon="calendar" tone="neutral" title="Nothing booked this day." /></Card>
        ) : (
          <Card>
            {selJobs.map((j) => {
              const where = (j.client?.first_name ? j.client.first_name + " · " : "") + (j.request?.location ?? "");
              return (
                <Row key={j.id} icon="calendar" tone="neutral"
                  title={timeLabel(j.scheduled_at) + " · " + (j.request?.service_needed ?? "Job")}
                  sub={where + (j.amount ? (where ? " · " : "") + money(Number(j.amount)) : "") + (where || j.amount ? " · " : "") + statusWords(j.status)}
                  chevron onPress={() => onOpen(j.id)} />
              );
            })}
          </Card>
        )}
      </Group>
    </View>
  );
}
