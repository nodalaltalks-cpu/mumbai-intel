import { formatCompactCount, formatPaise, formatPricePerSqft, formatSqft } from "@/lib/format";
import type { TransactionStats as TransactionStatsData } from "@/lib/queries";
import { StatCard } from "@/app/components/ui/StatCard";
import { gated, maskPaise, maskPricePerSqft } from "@/lib/premium/mask";

/** `locked` masks only the exact price figures (median/average/highest/lowest/₹-per-sqft) — total transaction count and average unit size stay visible, same descriptive-vs-exact-price split as TransactionTable. */
export default function TransactionStats({ stats, locked = false }: { stats: TransactionStatsData; locked?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      <StatCard label="Total transactions" value={formatCompactCount(stats.totalTransactions)} />
      <StatCard label="Median price" value={gated(locked, formatPaise(stats.medianPricePaise), maskPaise())} accent />
      <StatCard label="Average price" value={gated(locked, formatPaise(stats.avgPricePaise), maskPaise())} />
      <StatCard label="Avg ₹/sqft" value={gated(locked, formatPricePerSqft(stats.avgPricePerSqftPaise), maskPricePerSqft())} />
      <StatCard label="Highest" value={gated(locked, formatPaise(stats.highestPricePaise), maskPaise())} />
      <StatCard label="Lowest" value={gated(locked, formatPaise(stats.lowestPricePaise), maskPaise())} />
      <StatCard label="Avg unit size" value={formatSqft(stats.avgUnitSizeSqft)} />
    </div>
  );
}
