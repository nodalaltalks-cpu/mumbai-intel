import "server-only";
import { ANALYTICS_PERIOD_OPTIONS, type AnalyticsPeriodKey } from "./period-constants";

/**
 * The one reusable time-period mechanism for every Founder Admin analytics
 * page (Section 37: "Do NOT create different date-filter systems for
 * different analytics pages"). A page resolves its period once from
 * searchParams via resolveAnalyticsPeriod(), then passes `.since`/`.until`
 * straight into its existing query functions' new optional date params, and
 * `.previousSince`/`.previousUntil` into computeChange() for the "vs last
 * period" comparison. Calendar-aligned (not rolling windows) so "This Month"
 * literally means the current calendar month, matching the comparison
 * examples in the spec ("This Month: 1,240 / Previous Month: 1,050").
 *
 * The option list/key type live in ./period-constants (no "server-only"),
 * since AnalyticsPeriodFilter.tsx is a Client Component that needs them too.
 */

export type { AnalyticsPeriodKey };
export { ANALYTICS_PERIOD_OPTIONS };

export type AnalyticsGranularity = "hour" | "day" | "week" | "month";

export interface AnalyticsPeriod {
  key: AnalyticsPeriodKey;
  label: string;
  /**
   * "17 Aug 2026 – 23 Aug 2026" — the FULL calendar period being viewed, always
   * the complete range regardless of how much of it has elapsed (a founder
   * picking "Week" on a Wednesday still sees the whole Mon–Sun week, per
   * Section 13/14's "the actual date range should always be visible" and "if
   * the current period is still in progress, indicate that" — `label` already
   * does the indicating, e.g. "This Week"). Deliberately built from
   * `periodEnd`, NOT `until` — the query window still stops at "now" so no
   * page ever queries for data that can't exist yet; only the human-facing
   * range label shows the full period.
   */
  dateRangeLabel: string;
  since: Date;
  until: Date;
  previousSince: Date;
  previousUntil: Date;
  granularity: AnalyticsGranularity;
}

function formatPeriodDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** IST throughout, matching the rest of this app's admin-facing date display (formatDate/formatDateTime in lib/format.ts). `periodEnd` is the full calendar boundary (exclusive) — may be in the future for a still-in-progress period; the query window (`until`) is a separate, always-now-bounded value. */
function formatDateRangeLabel(since: Date, periodEnd: Date): string {
  const inclusiveEnd = new Date(periodEnd.getTime() - 1);
  return `${formatPeriodDate(since)} – ${formatPeriodDate(inclusiveEnd)}`;
}

/**
 * All calendar-boundary math below (startOfDay/Month/Quarter/... and their
 * startOfNext* counterparts) must land on the correct IST calendar day
 * regardless of the server process's own local timezone — this app has run
 * on machines in Asia/Dubai (dev) and Vercel's UTC runtime (prod), and the
 * previous implementation used plain `Date` getters/constructors, which read
 * and write in whatever timezone the OS/runtime happens to be in. That was
 * invisible while every period's displayed end was just "now", but became a
 * visible wrong-calendar-day bug once dateRangeLabel started showing a full
 * in-progress period's end (e.g. "This Month" showing "1 Sept" instead of
 * "31 Aug" on a UTC or Dubai server). IST has no DST, so it's a fixed
 * +5:30 offset — cheap to simulate without a date library: shift the UTC
 * instant by that offset, then read/write its UTC-getter fields as if they
 * were IST wall-clock fields.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** A Date whose UTC-getter fields (getUTCFullYear/getUTCMonth/getUTCDate/getUTCDay/...) equal the IST wall-clock values for `instant`. Never call the plain (non-UTC) getters on the result. */
function toIstWallClock(instant: Date): Date {
  return new Date(instant.getTime() + IST_OFFSET_MS);
}

/** Inverse of toIstWallClock — `wallClock` must be built from IST wall-clock values via Date.UTC(...); returns the real UTC instant that wall-clock moment represents. */
function fromIstWallClock(wallClock: Date): Date {
  return new Date(wallClock.getTime() - IST_OFFSET_MS);
}

function startOfDay(d: Date): Date {
  const w = toIstWallClock(d);
  return fromIstWallClock(new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate())));
}
/** Exported for the one other place in the codebase that needs an IST calendar-week boundary outside a "period relative to now" context — retention-queries.ts's signup-week cohort bucketing (Section 9). Everything else should keep going through resolveAnalyticsPeriod. */
export function startOfISOWeek(d: Date): Date {
  const w = toIstWallClock(d);
  const dayOfWeek = (w.getUTCDay() + 6) % 7; // 0 = Monday
  return fromIstWallClock(new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() - dayOfWeek)));
}
function startOfMonth(d: Date): Date {
  const w = toIstWallClock(d);
  return fromIstWallClock(new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), 1)));
}
function startOfQuarter(d: Date): Date {
  const w = toIstWallClock(d);
  return fromIstWallClock(new Date(Date.UTC(w.getUTCFullYear(), Math.floor(w.getUTCMonth() / 3) * 3, 1)));
}
function startOfHalfYear(d: Date): Date {
  const w = toIstWallClock(d);
  return fromIstWallClock(new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth() < 6 ? 0 : 6, 1)));
}
function startOfYear(d: Date): Date {
  const w = toIstWallClock(d);
  return fromIstWallClock(new Date(Date.UTC(w.getUTCFullYear(), 0, 1)));
}

function startOfNextDay(d: Date): Date {
  const w = toIstWallClock(d);
  return fromIstWallClock(new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() + 1)));
}
function startOfNextWeek(d: Date): Date {
  // A week is always exactly 7*24h in a fixed-offset (no-DST) zone, so pure ms arithmetic on the already-IST-correct week start is safe.
  return new Date(startOfISOWeek(d).getTime() + 7 * 24 * 60 * 60 * 1000);
}
function startOfNextMonth(d: Date): Date {
  const w = toIstWallClock(d);
  return fromIstWallClock(new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth() + 1, 1)));
}
function startOfNextQuarter(d: Date): Date {
  const w = toIstWallClock(d);
  return fromIstWallClock(new Date(Date.UTC(w.getUTCFullYear(), Math.floor(w.getUTCMonth() / 3) * 3 + 3, 1)));
}
function startOfNextHalfYear(d: Date): Date {
  const w = toIstWallClock(d);
  return fromIstWallClock(new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth() < 6 ? 6 : 12, 1)));
}
function startOfNextYear(d: Date): Date {
  const w = toIstWallClock(d);
  return fromIstWallClock(new Date(Date.UTC(w.getUTCFullYear() + 1, 0, 1)));
}

function pickGranularityForSpan(spanMs: number): AnalyticsGranularity {
  const hours = spanMs / (1000 * 60 * 60);
  if (hours <= 48) return "hour";
  if (hours <= 24 * 60) return "day"; // up to ~60 days
  if (hours <= 24 * 400) return "week"; // up to ~13 months
  return "month";
}

function isValidPeriodKey(v: string | undefined): v is AnalyticsPeriodKey {
  return ANALYTICS_PERIOD_OPTIONS.some((o) => o.key === v);
}

export const ANALYTICS_PERIOD_COOKIE = "mi_admin_analytics_period";

/**
 * Merges the current page's searchParams with the last-chosen period stored
 * in the mi_admin_analytics_period cookie (written by AnalyticsPeriodFilter),
 * so navigating to a *different* analytics page without an explicit
 * ?period= in its link still shows the founder's last choice instead of
 * resetting to "Month" (Section 39). An explicit ?period= in the URL always
 * wins over the cookie.
 */
export function resolveAnalyticsPeriodFromRequest(
  searchParams: { period?: string; from?: string; to?: string },
  cookieValue: string | undefined
): AnalyticsPeriod {
  if (searchParams.period) return resolveAnalyticsPeriod(searchParams);
  if (cookieValue) {
    const [key, from, to] = cookieValue.split(":");
    if (key === "custom" && from && to) return resolveAnalyticsPeriod({ period: "custom", from, to });
    if (isValidPeriodKey(key)) return resolveAnalyticsPeriod({ period: key });
  }
  return resolveAnalyticsPeriod({});
}

/** Parses `?period=` (+ `?from=&to=` for custom) into a fully resolved period. Defaults to "month" when absent/invalid — never silently falls back to an unbounded all-time query. */
export function resolveAnalyticsPeriod(params: { period?: string; from?: string; to?: string }): AnalyticsPeriod {
  const now = new Date();
  const key: AnalyticsPeriodKey = isValidPeriodKey(params.period) ? params.period : "month";

  if (key === "custom" && params.from && params.to) {
    const since = startOfDay(new Date(`${params.from}T00:00:00`));
    const untilRaw = new Date(`${params.to}T00:00:00`);
    const until = new Date(untilRaw.getTime() + 24 * 60 * 60 * 1000); // exclusive end of the "to" day
    const spanMs = Math.max(until.getTime() - since.getTime(), 1);
    const previousUntil = new Date(since);
    const previousSince = new Date(since.getTime() - spanMs);
    return {
      key,
      label: `${params.from} → ${params.to}`,
      dateRangeLabel: formatDateRangeLabel(since, until),
      since,
      until,
      previousSince,
      previousUntil,
      granularity: pickGranularityForSpan(spanMs),
    };
  }

  const resolved = ((): Omit<AnalyticsPeriod, "dateRangeLabel"> & { periodEnd: Date } => {
    switch (key) {
      case "day": {
        const since = startOfDay(now);
        const previousSince = new Date(since.getTime() - 24 * 60 * 60 * 1000);
        return { key, label: "Today", since, until: now, previousSince, previousUntil: since, granularity: "hour", periodEnd: startOfNextDay(now) };
      }
      case "week": {
        const since = startOfISOWeek(now);
        const previousSince = new Date(since.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { key, label: "This Week", since, until: now, previousSince, previousUntil: since, granularity: "day", periodEnd: startOfNextWeek(now) };
      }
      case "quarter": {
        const since = startOfQuarter(now);
        const previousSince = startOfQuarter(new Date(since.getTime() - 24 * 60 * 60 * 1000));
        return { key, label: "This Quarter", since, until: now, previousSince, previousUntil: since, granularity: "week", periodEnd: startOfNextQuarter(now) };
      }
      case "half_year": {
        const since = startOfHalfYear(now);
        const previousSince = startOfHalfYear(new Date(since.getTime() - 24 * 60 * 60 * 1000));
        return { key, label: "This Half Year", since, until: now, previousSince, previousUntil: since, granularity: "month", periodEnd: startOfNextHalfYear(now) };
      }
      case "year": {
        const since = startOfYear(now);
        const previousSince = startOfYear(new Date(since.getTime() - 1));
        return { key, label: "This Year", since, until: now, previousSince, previousUntil: since, granularity: "month", periodEnd: startOfNextYear(now) };
      }
      case "month":
      default: {
        const since = startOfMonth(now);
        const previousSince = startOfMonth(new Date(since.getTime() - 1));
        return { key: "month", label: "This Month", since, until: now, previousSince, previousUntil: since, granularity: "day", periodEnd: startOfNextMonth(now) };
      }
    }
  })();
  const { periodEnd, ...period } = resolved;
  return { ...period, dateRangeLabel: formatDateRangeLabel(period.since, periodEnd) };
}

export interface PeriodChange {
  /** null when the previous period has no data — never a fabricated/infinite percentage (Section 35/41). */
  percent: number | null;
  direction: "up" | "down" | "flat";
}

export function computeChange(current: number, previous: number): PeriodChange {
  if (previous <= 0) {
    return { percent: null, direction: current > 0 ? "up" : "flat" };
  }
  const percent = Math.round(((current - previous) / previous) * 1000) / 10;
  return { percent, direction: percent > 0 ? "up" : percent < 0 ? "down" : "flat" };
}

/** Splits [since, until) into buckets at the period's chosen granularity — shared by every page's trend chart so bucket counts stay bounded (Section 36: "do not unnecessarily create hundreds of data points"). */
export function buildBuckets(period: AnalyticsPeriod): { start: Date; end: Date; label: string }[] {
  const buckets: { start: Date; end: Date; label: string }[] = [];
  const { since, until, granularity } = period;

  if (granularity === "hour") {
    for (let t = new Date(since); t < until; t = new Date(t.getTime() + 60 * 60 * 1000)) {
      const end = new Date(Math.min(t.getTime() + 60 * 60 * 1000, until.getTime()));
      buckets.push({ start: new Date(t), end, label: t.toLocaleTimeString("en-IN", { hour: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) });
    }
    return buckets;
  }
  if (granularity === "day") {
    for (let t = startOfDay(since); t < until; t = new Date(t.getTime() + 24 * 60 * 60 * 1000)) {
      const end = new Date(t.getTime() + 24 * 60 * 60 * 1000);
      buckets.push({ start: new Date(t), end, label: t.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }) });
    }
    return buckets;
  }
  if (granularity === "week") {
    for (let t = startOfISOWeek(since); t < until; t = new Date(t.getTime() + 7 * 24 * 60 * 60 * 1000)) {
      const end = new Date(t.getTime() + 7 * 24 * 60 * 60 * 1000);
      buckets.push({ start: new Date(t), end, label: t.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }) });
    }
    return buckets;
  }
  // month
  for (let t = startOfMonth(since); t < until; t = startOfNextMonth(t)) {
    const end = startOfNextMonth(t);
    buckets.push({ start: new Date(t), end, label: t.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "Asia/Kolkata" }) });
  }
  return buckets;
}

/** Buckets a set of timestamps against buildBuckets()'s output — the one counting routine every trend query reuses instead of each hand-rolling its own loop. */
export function countByBucket(timestamps: Date[], buckets: { start: Date; end: Date; label: string }[]): { label: string; count: number }[] {
  return buckets.map((b) => ({
    label: b.label,
    count: timestamps.filter((t) => t >= b.start && t < b.end).length,
  }));
}
