import PriceTrendChart from "./charts/PriceTrendChart";
import { getCityPriceTrend } from "@/lib/queries";
import SectionHeading from "./ui/SectionHeading";

export default async function PriceTrend() {
  const points = await getCityPriceTrend(12);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <SectionHeading title="Price Trend" subtitle="Average ₹/sqft across live Mumbai projects, last 12 months" viewAllHref="/market-data" />
      <div className="rounded-sm border border-border bg-surface p-4">
        <PriceTrendChart
          points={points.map((p) => ({
            month: p.month.toISOString(),
            avgPricePerSqftPaise: p.avgPricePerSqftPaise,
          }))}
        />
      </div>
    </section>
  );
}
