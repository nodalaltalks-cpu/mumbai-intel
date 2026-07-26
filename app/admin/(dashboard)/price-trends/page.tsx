import type { Metadata } from "next";
import { getLocalityMarketSnapshot, getMonthlyPriceTrend } from "@/lib/admin-queries";
import { formatPricePerSqft, formatSignedPercent } from "@/lib/format";
import PriceTrendChart from "@/app/components/charts/PriceTrendChart";

export const metadata: Metadata = { title: "Price Trends — Mumbai Intel Admin" };
export const dynamic = "force-dynamic";

export default async function PriceTrendsPage() {
  const [trend, localities] = await Promise.all([getMonthlyPriceTrend(12), getLocalityMarketSnapshot()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Price Trends</h1>
        <p className="text-xs text-muted">Derived from recorded transactions and curated locality market snapshots.</p>
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">City-wide avg ₹/sqft (registered transactions, last 12 months)</h2>
        <PriceTrendChart points={trend} />
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Locality market snapshot</h2>
        {localities.length === 0 ? (
          <p className="text-xs text-muted">
            No locality market data curated yet. Add average price, rental yield and YoY growth from each locality&apos;s
            edit page.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Locality</th>
                  <th className="py-2 pr-3 font-medium">Avg ₹/sqft</th>
                  <th className="py-2 pr-3 font-medium">Rental yield</th>
                  <th className="py-2 pr-3 font-medium">YoY growth</th>
                </tr>
              </thead>
              <tbody>
                {localities.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-b-0">
                    <td className="py-2 pr-3 font-mono text-foreground">{l.name}</td>
                    <td className="py-2 pr-3 text-muted">{formatPricePerSqft(l.avgPricePerSqftPaise)}</td>
                    <td className="py-2 pr-3 text-muted">{l.rentalYieldPercent !== null ? `${Number(l.rentalYieldPercent).toFixed(1)}%` : "--"}</td>
                    <td className="py-2 pr-3 text-muted">{formatSignedPercent(l.growthPercentYoy !== null ? Number(l.growthPercentYoy) : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
