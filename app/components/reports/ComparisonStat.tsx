import { formatSignedPercent } from "@/lib/format";
import Badge from "@/app/components/ui/Badge";

/**
 * One "this entity vs market baseline" tile — value, the baseline it's being
 * measured against, and the delta (from MarketAnalyticsService.calculateGrowthPercent,
 * baseline as the previous value / entity as the current value).
 */
export default function ComparisonStat({
  label,
  value,
  baselineLabel,
  baselineValue,
  deltaPercent,
}: {
  label: string;
  value: string;
  baselineLabel: string;
  baselineValue: string;
  deltaPercent: number | null;
}) {
  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <p className="font-mono text-xl font-semibold text-foreground">{value}</p>
        {deltaPercent !== null ? (
          <Badge tone={deltaPercent > 0 ? "positive" : deltaPercent < 0 ? "negative" : "muted"}>{formatSignedPercent(deltaPercent)}</Badge>
        ) : null}
      </div>
      <p className="mt-1.5 text-[11px] text-muted">
        {baselineLabel}: <span className="text-foreground">{baselineValue}</span>
      </p>
    </div>
  );
}
