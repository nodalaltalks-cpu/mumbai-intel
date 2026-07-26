import type { Metadata } from "next";
import Link from "next/link";
import { getCityPriceTrend, getPublicBuilderTrustLeaderboard, getPublicLocalityMarketSnapshot } from "@/lib/queries";
import { formatMonth, formatPricePerSqft, formatSignedPercent } from "@/lib/format";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import SectionHeading from "@/app/components/ui/SectionHeading";
import EmptyState from "@/app/components/ui/EmptyState";

export const metadata: Metadata = {
  title: "Market Data — Mumbai Intel",
  description: "Citywide price trends, locality market snapshots and builder activity across Mumbai's residential and commercial real estate.",
};
export const dynamic = "force-dynamic";

export default async function MarketDataPage() {
  const [priceTrend, localitySnapshot, builderLeaderboard] = await Promise.all([
    getCityPriceTrend(12),
    getPublicLocalityMarketSnapshot(),
    getPublicBuilderTrustLeaderboard(10),
  ]);

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />

      <main id="main-content" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-8 sm:px-6">
        <div>
          <h1 className="font-mono text-2xl font-bold text-foreground">Market Data</h1>
          <p className="mt-1 text-sm text-muted">City-wide price trends, locality benchmarks and builder trust scores — every figure traceable to its source.</p>
        </div>

        <section>
          <SectionHeading title="Mumbai Price Trend" subtitle="Average ₹/sqft across registered transactions, last 12 months" />
          {priceTrend.length > 0 ? (
            <div className="overflow-x-auto rounded-sm border border-border">
              <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium">Month</th>
                    <th className="px-3 py-2 font-medium text-right">Avg ₹/sqft</th>
                  </tr>
                </thead>
                <tbody>
                  {priceTrend.map((point, i) => (
                    <tr key={i} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 font-mono text-foreground">{formatMonth(point.month)}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted">{formatPricePerSqft(point.avgPricePerSqftPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No price history yet" message="City-wide price trend appears once transactions are recorded." />
          )}
        </section>

        <section>
          <SectionHeading title="Locality Benchmarks" subtitle="Average price, rental yield and YoY growth by locality" viewAllHref="/localities" />
          {localitySnapshot.length > 0 ? (
            <div className="overflow-x-auto rounded-sm border border-border">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium">Locality</th>
                    <th className="px-3 py-2 font-medium text-right">Avg ₹/sqft</th>
                    <th className="px-3 py-2 font-medium text-right">Rental yield</th>
                    <th className="px-3 py-2 font-medium text-right">YoY growth</th>
                  </tr>
                </thead>
                <tbody>
                  {localitySnapshot.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                      <td className="px-3 py-2">
                        <Link href={`/localities/${l.slug}`} className="font-mono text-foreground hover:text-accent">
                          {l.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted">{formatPricePerSqft(l.avgPricePerSqftPaise)}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted">{l.rentalYieldPercent !== null ? `${l.rentalYieldPercent}%` : "--"}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted">{formatSignedPercent(l.growthPercentYoy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No locality market data yet" />
          )}
        </section>

        <section>
          <SectionHeading title="Builder Trust Leaderboard" subtitle="Ranked by overall delivery track record score" viewAllHref="/builders" />
          {builderLeaderboard.length > 0 ? (
            <div className="overflow-x-auto rounded-sm border border-border">
              <table className="w-full min-w-[400px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium">Rank</th>
                    <th className="px-3 py-2 font-medium">Builder</th>
                    <th className="px-3 py-2 font-medium text-right">Trust score</th>
                  </tr>
                </thead>
                <tbody>
                  {builderLeaderboard.map((b, i) => (
                    <tr key={b.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                      <td className="px-3 py-2 font-mono text-muted">#{i + 1}</td>
                      <td className="px-3 py-2">
                        <Link href={`/builders/${b.slug}`} className="font-mono text-foreground hover:text-accent">
                          {b.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-accent">{b.score.toFixed(1)}/10</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No builder scores yet" />
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
