// Pure derivations for the Jobs-tab calendar (PLAN 5.8), ported from web
// components/JobsCalendar.tsx. One deliberate difference: web buckets by the
// browser's local day; the app buckets by CALGARY (America/Edmonton) day, never the
// device's zone and never UTC (web CLAUDE.md timezone rule), so a job at 9pm
// Calgary time is on that day for a pro travelling or a phone set to another zone.

export const TZ = "America/Edmonton";

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export type YM = { y: number; m: number }; // m is 0-based, like Date

/** "YYYY-MM-DD" of an instant, read on the Calgary wall clock. "" when unreadable. */
export function calgaryDayKey(input: string | number | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const p = dayFmt.formatToParts(d);
  const get = (type: string) => p.find((x) => x.type === type)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

export const keyOf = (y: number, m: number, d: number) => String(y).padStart(4, "0") + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");

export function calgaryToday(now: Date = new Date()): { key: string; ym: YM } {
  const key = calgaryDayKey(now);
  return { key, ym: { y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)) - 1 } };
}

export const shiftMonth = (ym: YM, delta: number): YM => {
  const n = ym.y * 12 + ym.m + delta;
  return { y: Math.floor(n / 12), m: ((n % 12) + 12) % 12 };
};

/** Month grid, weeks start Sunday (web). null = padding cell. Pure calendar arithmetic, no zone involved. */
export function monthCells(ym: YM): (number | null)[] {
  const startDow = new Date(Date.UTC(ym.y, ym.m, 1)).getUTCDay();
  const days = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Jobs with a booked time, not cancelled, bucketed by Calgary day and sorted by time (web). */
export function bucketByDay(jobs: any[]): Record<string, any[]> {
  const byDay: Record<string, any[]> = {};
  for (const j of jobs) {
    if (!j.scheduled_at || j.status === "cancelled") continue;
    const k = calgaryDayKey(j.scheduled_at);
    if (!k) continue;
    (byDay[k] = byDay[k] || []).push(j);
  }
  for (const k of Object.keys(byDay)) byDay[k].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  return byDay;
}

/** Active jobs with no booked time (web's nudge above the grid). */
export const unscheduledCount = (jobs: any[]) => jobs.filter((j) => !j.scheduled_at && (j.status === "assigned" || j.status === "in_progress")).length;

export const monthLabel = (ym: YM) => new Date(Date.UTC(ym.y, ym.m, 1)).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
export const dayLabel = (key: string) => {
  const d = new Date(key + "T12:00:00Z");
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
};
export const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", timeZone: TZ });

export const statusWords = (s: string) => String(s).replace(/_/g, " ");
