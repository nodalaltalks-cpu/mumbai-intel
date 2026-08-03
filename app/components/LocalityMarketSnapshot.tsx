import { formatCompactCount, formatPaise, formatPricePerSqft, formatSignedPercent } from "@/lib/format";
import type { TransactionStats } from "@/lib/queries";
import { StatCard } from "@/app/components/ui/StatCard";
import { gated, maskPaise, maskPercent, maskPricePerSqft } from "@/lib/premium/mask";

/** `locked` masks price, rental yield (Rental Intelligence) and YoY growth (Capital Appreciation) — total transaction count stays visible. */
export default function LocalityMarketSnapshot({
  stats,
  avgPricePerSqftPaise,
  rentalYieldPercent,
  growthPercentYoy,
  locked = false,
}: {
  stats: TransactionStats;
  avgPricePerSqftPaise: number | null;
  rentalYieldPercent: number | null;
  growthPercentYoy: number | null;
  locked?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      <StatCard label="Median price" value={gated(locked, formatPaise(stats.medianPricePaise), maskPaise())} accent />
      <StatCard label="Average price" value={gated(locked, formatPaise(stats.avgPricePaise), maskPaise())} />
      <StatCard label="Price / sqft" value={gated(locked, formatPricePerSqft(avgPricePerSqftPaise), maskPricePerSqft())} />
      <StatCard label="Rental yield" value={gated(locked, rentalYieldPercent !== null ? `${rentalYieldPercent}%` : "--", maskPercent())} />
      <StatCard label="Sales volume" value={gated(locked, formatPaise(stats.totalSalesVolumePaise), maskPaise())} />
      <StatCard label="Total transactions" value={formatCompactCount(stats.totalTransactions)} />
      <StatCard label="YoY growth" value={gated(locked, formatSignedPercent(growthPercentYoy), maskPercent())} />
    </div>
  );
}
