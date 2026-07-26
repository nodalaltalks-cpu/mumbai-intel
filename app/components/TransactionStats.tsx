import { formatCompactCount, formatPaise, formatPricePerSqft, formatSqft } from "@/lib/format";
import type { TransactionStats as TransactionStatsData } from "@/lib/queries";
import { StatCard } from "@/app/components/ui/StatCard";

export default function TransactionStats({ stats }: { stats: TransactionStatsData }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      <StatCard label="Total transactions" value={formatCompactCount(stats.totalTransactions)} />
      <StatCard label="Median price" value={formatPaise(stats.medianPricePaise)} accent />
      <StatCard label="Average price" value={formatPaise(stats.avgPricePaise)} />
      <StatCard label="Avg ₹/sqft" value={formatPricePerSqft(stats.avgPricePerSqftPaise)} />
      <StatCard label="Highest" value={formatPaise(stats.highestPricePaise)} />
      <StatCard label="Lowest" value={formatPaise(stats.lowestPricePaise)} />
      <StatCard label="Avg unit size" value={formatSqft(stats.avgUnitSizeSqft)} />
    </div>
  );
}
