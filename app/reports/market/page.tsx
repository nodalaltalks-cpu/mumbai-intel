import type { Metadata } from "next";
import Link from "next/link";
import {
  getCityPriceTrend,
  getFeaturedProjects,
  getMarketSnapshot,
  getTopDevelopers,
  getTopLocalitiesByActivity,
  getTransactionMonthlyTrend,
  getTransactionPropertyTypeDistribution,
} from "@/lib/queries";
import { AnalyticsService } from "@/lib/analytics";
import { formatCompactCount, formatMonth, formatPricePerSqft } from "@/lib/format";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import Breadcrumbs from "@/app/components/Breadcrumbs";
import ProjectCard from "@/app/components/ProjectCard";
import BuilderCard from "@/app/components/BuilderCard";
import { StatCard } from "@/app/components/ui/StatCard";
import { PropertyTypeDistribution, TransactionLineChart, TransactionVolumeChart } from "@/app/components/charts/TransactionCharts";
import ReportHeader from "@/app/components/reports/ReportHeader";
import ReportSection from "@/app/components/reports/ReportSection";
import MarketSummaryCard from "@/app/components/reports/MarketSummaryCard";
import HistoricalTable from "@/app/components/reports/HistoricalTable";
import RelatedSection from "@/app/components/reports/RelatedSection";
import { recordRecentViewAction } from "@/lib/actions/recent-views";
import { MARKET_REPORT_ENTITY_ID } from "@/lib/queries/dashboard";

export const metadata: Metadata = {
  title: "Market Report — Mumbai Intel",
  description: "City-wide Mumbai real estate KPIs, price trends, and trending-area rankings.",
};
export const dynamic = "force-dynamic";

const NAV_SECTIONS = [
  { id: "summary", label: "Summary" },
  { id: "kpis", label: "KPIs" },
  { id: "charts", label: "Charts" },
  { id: "comparisons", label: "Trending Areas" },
  { id: "historical", label: "Historical" },
  { id: "related-projects", label: "Projects" },
  { id: "related-developers", label: "Developers" },
];

export default async function MarketReportPage() {
  await recordRecentViewAction("MarketReport", MARKET_REPORT_ENTITY_ID);

  const [snapshot, priceTrend, monthlyTrend, propertyTypes, topLocalities, featuredProjects, topDevelopers] = await Promise.all([
    getMarketSnapshot(),
    getCityPriceTrend(12),
    getTransactionMonthlyTrend({}, 12),
    getTransactionPropertyTypeDistribution({}),
    getTopLocalitiesByActivity(6),
    getFeaturedProjects(6),
    getTopDevelopers(4),
  ]);

  const growthPercentYoy =
    priceTrend.length >= 2 ? AnalyticsService.Market.calculateGrowthPercent(priceTrend[0].avgPricePerSqftPaise, priceTrend[priceTrend.length - 1].avgPricePerSqftPaise) : null;

  const summary = AnalyticsService.Market.calculateMarketSummary({
    scopeName: "Mumbai",
    liveProjectsCount: snapshot.liveProjectsCount,
    localitiesCount: snapshot.localitiesCount,
    buildersCount: snapshot.buildersCount,
    transactionsCount: snapshot.transactionsCount,
    transactions90dCount: snapshot.transactions90dCount,
    growthPercentYoy,
  });

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Reports", href: "/reports" }, { label: "Market Report" }]} />

      <ReportHeader
        kicker="Market Report"
        title="Mumbai Residential Market"
        subtitle="City-wide market intelligence, generated from live registered transaction data"
        meta={[
          { label: "Avg price/sqft", value: formatPricePerSqft(snapshot.avgPricePerSqftPaise) },
          { label: "Live projects", value: formatCompactCount(snapshot.liveProjectsCount) },
          { label: "Transactions (90d)", value: formatCompactCount(snapshot.transactions90dCount) },
        ]}
      />

      <nav className="sticky top-[57px] z-40 overflow-x-auto border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl gap-4 py-2.5">
          {NAV_SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="shrink-0 text-xs uppercase tracking-wide text-muted hover:text-accent">
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      <main id="main-content" className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6">
        <ReportSection id="summary" title="Market Summary">
          <MarketSummaryCard summary={summary} />
        </ReportSection>

        <ReportSection id="kpis" title="Key Performance Indicators">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Live projects" value={formatCompactCount(snapshot.liveProjectsCount)} accent />
            <StatCard label="Localities covered" value={formatCompactCount(snapshot.localitiesCount)} />
            <StatCard label="Transactions recorded" value={formatCompactCount(snapshot.transactionsCount)} />
            <StatCard label="Transactions (90d)" value={formatCompactCount(snapshot.transactions90dCount)} />
            <StatCard label="Builders tracked" value={formatCompactCount(snapshot.buildersCount)} />
            <StatCard label="Avg price/sqft" value={formatPricePerSqft(snapshot.avgPricePerSqftPaise)} />
          </div>
        </ReportSection>

        <ReportSection id="charts" title="Charts & Trends">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">City Price Trend</p>
              <div className="mt-3">
                <TransactionLineChart points={priceTrend.map((p) => ({ month: p.month.toISOString(), value: p.avgPricePerSqftPaise }))} ariaLabel="City-wide average price per square foot" />
              </div>
            </div>
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Transaction Volume</p>
              <div className="mt-3">
                <TransactionVolumeChart points={monthlyTrend.map((p) => ({ month: p.month.toISOString(), count: p.count }))} />
              </div>
            </div>
            <div className="rounded-sm border border-border bg-surface p-4 lg:col-span-2">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Property Type Mix</p>
              <div className="mt-3">
                <PropertyTypeDistribution buckets={propertyTypes} />
              </div>
            </div>
          </div>
        </ReportSection>

        <ReportSection id="comparisons" title="Trending Areas" description="Ranked by registered-transaction activity">
          {topLocalities.length > 0 ? (
            <div className="overflow-x-auto rounded-sm border border-border">
              <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium">Rank</th>
                    <th className="px-3 py-2 font-medium">Locality</th>
                    <th className="px-3 py-2 font-medium text-right">Transactions</th>
                    <th className="px-3 py-2 font-medium text-right">Avg ₹/sqft</th>
                  </tr>
                </thead>
                <tbody>
                  {topLocalities.map((l, i) => (
                    <tr key={l.localityId} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 font-mono text-muted">#{i + 1}</td>
                      <td className="px-3 py-2 font-mono text-foreground">{l.localityName}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted">{l.transactionCount}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted">{formatPricePerSqft(l.avgPricePerSqftPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">No transaction activity recorded yet.</p>
          )}
        </ReportSection>

        <ReportSection id="historical" title="Historical Data" description="City-wide average price per square foot, last 12 months">
          <HistoricalTable columnLabels={["Avg ₹/sqft"]} rows={priceTrend.map((p) => ({ label: formatMonth(p.month), values: [formatPricePerSqft(p.avgPricePerSqftPaise)] }))} />
        </ReportSection>

        <RelatedSection id="related-projects" title="Featured Projects" isEmpty={featuredProjects.length === 0} emptyMessage="No featured projects yet.">
          {featuredProjects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </RelatedSection>

        <RelatedSection id="related-developers" title="Top Developers" isEmpty={topDevelopers.length === 0} emptyMessage="No developer scores yet.">
          {topDevelopers.map((b) => (
            <BuilderCard key={b.slug} builder={b} />
          ))}
        </RelatedSection>

        <div>
          <Link href="/reports" className="text-xs text-muted hover:text-accent">
            ← Back to all reports
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
