/** Client-safe constants split out of lib/analytics/period.ts (which is "server-only") so AnalyticsPeriodFilter.tsx can import the option list/type without pulling server-only code into the client bundle. */

export type AnalyticsPeriodKey = "day" | "week" | "month" | "quarter" | "half_year" | "year" | "custom";

export const ANALYTICS_PERIOD_OPTIONS: { key: AnalyticsPeriodKey; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "half_year", label: "Half Year" },
  { key: "year", label: "Year" },
  { key: "custom", label: "Custom" },
];
