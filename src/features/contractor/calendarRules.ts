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

// ── Calgary wall clock <-> instant (PLAN 5.7: proposing a time) ─────────────────
// Web's ScheduleField emits a "YYYY-MM-DDTHH:mm" read on the BROWSER's clock and
// `new Date(v).toISOString()` turns it into an instant. On a phone the device zone
// can be anywhere, so the app reads and writes that string on the CALGARY clock:
// a pro travelling in Toronto who picks 9:00 AM means 9:00 AM at the job.
const wallFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

function wallParts(d: Date) {
  const p = wallFmt.formatToParts(d);
  const get = (type: string) => Number(p.find((x) => x.type === type)?.value ?? NaN);
  const h = get("hour");
  return { y: get("year"), m: get("month"), d: get("day"), h: h === 24 ? 0 : h, mi: get("minute"), s: get("second") };
}

/** Calgary's UTC offset (ms, negative) at an instant. */
function calgaryOffsetMs(utcMs: number): number {
  const w = wallParts(new Date(utcMs));
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(utcMs / 1000) * 1000;
}

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "YYYY-MM-DDTHH:mm" on the Calgary clock → ISO instant. null when unreadable. */
export function calgaryWallToIso(wall: string): string | null {
  const m = WALL_RE.exec(wall || "");
  if (!m) return null;
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  if (!Number.isFinite(guess)) return null;
  let ts = guess - calgaryOffsetMs(guess);
  const second = calgaryOffsetMs(ts); // across a DST change the first guess can be an hour out
  if (guess - second !== ts) ts = guess - second;
  return new Date(ts).toISOString();
}

/** ISO instant → "YYYY-MM-DDTHH:mm" on the Calgary clock. "" when unreadable. */
export function isoToCalgaryWall(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const w = wallParts(d);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return w.y + "-" + p2(w.m) + "-" + p2(w.d) + "T" + p2(w.h) + ":" + p2(w.mi);
}

/** Long date + time in Calgary (web's `toLocaleString()` spots). */
export function whenLong(iso: string | null | undefined, fallback = "the agreed time"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString("en-CA", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
