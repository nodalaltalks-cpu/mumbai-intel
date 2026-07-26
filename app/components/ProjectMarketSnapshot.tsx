import { formatCompactCount, formatPaise, formatPricePerSqft } from "@/lib/format";
import type { TransactionStats } from "@/lib/queries";
import { StatCard } from "@/app/components/ui/StatCard";

export default function ProjectMarketSnapshot({
  stats,
  startingPricePaise,
  pricePerSqftPaise,
  rentalYieldPercent,
  investmentScore,
}: {
  stats: TransactionStats;
  startingPricePaise: number | null;
  pricePerSqftPaise: number | null;
  rentalYieldPercent: number | null;
  investmentScore: number | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Starting price" value={formatPaise(startingPricePaise)} accent />
      <StatCard label="Average price" value={formatPaise(stats.avgPricePaise)} />
      <StatCard label="Median price" value={formatPaise(stats.medianPricePaise)} />
      <StatCard label="Price / sqft" value={formatPricePerSqft(stats.avgPricePerSqftPaise ?? pricePerSqftPaise)} />
      <StatCard label="Rental yield" value={rentalYieldPercent !== null ? `${rentalYieldPercent}%` : "--"} />
      <StatCard label="Investment score" value={investmentScore !== null ? `${investmentScore.toFixed(1)}/10` : "--"} accent />
      <StatCard label="Total transactions" value={formatCompactCount(stats.totalTransactions)} />
      <StatCard label="Sales volume" value={formatPaise(stats.totalSalesVolumePaise)} />
    </div>
  );
}
