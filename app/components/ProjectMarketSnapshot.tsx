import { formatCompactCount, formatPaise, formatPricePerSqft } from "@/lib/format";
import type { TransactionStats } from "@/lib/queries";
import { StatCard } from "@/app/components/ui/StatCard";
import { gated, maskPaise, maskPercent, maskPricePerSqft, maskScore } from "@/lib/premium/mask";

/** `locked` masks everything derived from transaction/market data — Starting price stays visible since it's the same price band already shown on every Project Card. */
export default function ProjectMarketSnapshot({
  stats,
  startingPricePaise,
  pricePerSqftPaise,
  rentalYieldPercent,
  investmentScore,
  locked = false,
}: {
  stats: TransactionStats;
  startingPricePaise: number | null;
  pricePerSqftPaise: number | null;
  rentalYieldPercent: number | null;
  investmentScore: number | null;
  locked?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Starting price" value={formatPaise(startingPricePaise)} accent />
      <StatCard label="Average price" value={gated(locked, formatPaise(stats.avgPricePaise), maskPaise())} />
      <StatCard label="Median price" value={gated(locked, formatPaise(stats.medianPricePaise), maskPaise())} />
      <StatCard label="Price / sqft" value={gated(locked, formatPricePerSqft(stats.avgPricePerSqftPaise ?? pricePerSqftPaise), maskPricePerSqft())} />
      <StatCard label="Rental yield" value={gated(locked, rentalYieldPercent !== null ? `${rentalYieldPercent}%` : "--", maskPercent())} />
      <StatCard label="Investment score" value={gated(locked, investmentScore !== null ? `${investmentScore.toFixed(1)}/10` : "--", maskScore())} accent />
      <StatCard label="Total transactions" value={formatCompactCount(stats.totalTransactions)} />
      <StatCard label="Sales volume" value={gated(locked, formatPaise(stats.totalSalesVolumePaise), maskPaise())} />
    </div>
  );
}
