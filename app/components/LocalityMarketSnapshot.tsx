import { formatCompactCount, formatPaise, formatPricePerSqft, formatSignedPercent } from "@/lib/format";
import type { TransactionStats } from "@/lib/queries";
import { StatCard } from "@/app/components/ui/StatCard";

export default function LocalityMarketSnapshot({
  stats,
  avgPricePerSqftPaise,
  rentalYieldPercent,
  growthPercentYoy,
}: {
  stats: TransactionStats;
  avgPricePerSqftPaise: number | null;
  rentalYieldPercent: number | null;
  growthPercentYoy: number | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      <StatCard label="Median price" value={formatPaise(stats.medianPricePaise)} accent />
      <StatCard label="Average price" value={formatPaise(stats.avgPricePaise)} />
      <StatCard label="Price / sqft" value={formatPricePerSqft(avgPricePerSqftPaise)} />
      <StatCard label="Rental yield" value={rentalYieldPercent !== null ? `${rentalYieldPercent}%` : "--"} />
      <StatCard label="Sales volume" value={formatPaise(stats.totalSalesVolumePaise)} />
      <StatCard label="Total transactions" value={formatCompactCount(stats.totalTransactions)} />
      <StatCard label="YoY growth" value={formatSignedPercent(growthPercentYoy)} />
    </div>
  );
}
