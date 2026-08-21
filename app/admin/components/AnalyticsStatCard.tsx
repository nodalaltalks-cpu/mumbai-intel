import type { PeriodChange } from "@/lib/analytics/period";

/** The one reusable "This period: N / Previous period: M / Change: +X%" tile — used across every retrofitted analytics page instead of each hand-rolling its own comparison markup. Never renders a percentage when the previous period had zero data (Section 35). */
export default function AnalyticsStatCard({
  label,
  value,
  previousValue,
  change,
}: {
  label: string;
  value: number;
  previousValue?: number;
  change?: PeriodChange;
}) {
  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{value.toLocaleString("en-IN")}</p>
      {previousValue !== undefined ? (
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
          <span className="text-muted">Previous: {previousValue.toLocaleString("en-IN")}</span>
          {change ? (
            change.percent === null ? (
              <span className="text-muted">{value > 0 && previousValue === 0 ? "(new)" : ""}</span>
            ) : (
              <span className={change.direction === "up" ? "text-positive" : change.direction === "down" ? "text-negative" : "text-muted"}>
                {change.percent > 0 ? "+" : ""}
                {change.percent}%
              </span>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
