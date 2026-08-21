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
  since: Date;
  until: Date;
  previousSince: Date;
  previousUntil: Date;
  granularity: AnalyticsGranularity;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfISOWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - day);
  return x;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfQuarter(d: Date): Date {
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
}
function startOfHalfYear(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() < 6 ? 0 : 6, 1);
}
function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
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
      since,
      until,
      previousSince,
      previousUntil,
      granularity: pickGranularityForSpan(spanMs),
    };
  }

  switch (key) {
    case "day": {
      const since = startOfDay(now);
      const previousSince = new Date(since.getTime() - 24 * 60 * 60 * 1000);
      return { key, label: "Today", since, until: now, previousSince, previousUntil: since, granularity: "hour" };
    }
    case "week": {
      const since = startOfISOWeek(now);
      const previousSince = new Date(since.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { key, label: "This Week", since, until: now, previousSince, previousUntil: since, granularity: "day" };
    }
    case "quarter": {
      const since = startOfQuarter(now);
      const previousSince = startOfQuarter(new Date(since.getTime() - 24 * 60 * 60 * 1000));
      return { key, label: "This Quarter", since, until: now, previousSince, previousUntil: since, granularity: "week" };
    }
    case "half_year": {
      const since = startOfHalfYear(now);
      const previousSince = startOfHalfYear(new Date(since.getTime() - 24 * 60 * 60 * 1000));
      return { key, label: "This Half Year", since, until: now, previousSince, previousUntil: since, granularity: "month" };
    }
    case "year": {
      const since = startOfYear(now);
      const previousSince = new Date(since.getFullYear() - 1, 0, 1);
      return { key, label: "This Year", since, until: now, previousSince, previousUntil: since, granularity: "month" };
    }
    case "month":
    default: {
      const since = startOfMonth(now);
      const previousSince = new Date(since.getFullYear(), since.getMonth() - 1, 1);
      return { key: "month", label: "This Month", since, until: now, previousSince, previousUntil: since, granularity: "day" };
    }
  }
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
      buckets.push({ start: new Date(t), end, label: t.toLocaleTimeString("en-IN", { hour: "2-digit", hour12: true }) });
    }
    return buckets;
  }
  if (granularity === "day") {
    for (let t = startOfDay(since); t < until; t = new Date(t.getTime() + 24 * 60 * 60 * 1000)) {
      const end = new Date(t.getTime() + 24 * 60 * 60 * 1000);
      buckets.push({ start: new Date(t), end, label: t.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) });
    }
    return buckets;
  }
  if (granularity === "week") {
    for (let t = startOfISOWeek(since); t < until; t = new Date(t.getTime() + 7 * 24 * 60 * 60 * 1000)) {
      const end = new Date(t.getTime() + 7 * 24 * 60 * 60 * 1000);
      buckets.push({ start: new Date(t), end, label: t.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) });
    }
    return buckets;
  }
  // month
  for (let t = startOfMonth(since); t < until; t = new Date(t.getFullYear(), t.getMonth() + 1, 1)) {
    const end = new Date(t.getFullYear(), t.getMonth() + 1, 1);
    buckets.push({ start: new Date(t), end, label: t.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) });
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
