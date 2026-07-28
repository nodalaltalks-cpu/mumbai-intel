import type { Metadata } from "next";
import Link from "next/link";
import {
  getMarketSnapshot,
  getPublicLocalitiesPaged,
  getRecentlyActiveDevelopers,
  getTopProjectsByActivity,
  getTransactionConfigurationDistribution,
  getTransactionMonthlyTrend,
  getTransactionPropertyTypeDistribution,
  getTransactionStats,
} from "@/lib/queries";
import { AnalyticsService } from "@/lib/analytics";
import { formatCompactCount, formatMonth, formatPaise, formatPricePerSqft } from "@/lib/format";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import Breadcrumbs from "@/app/components/Breadcrumbs";
import ProjectCard from "@/app/components/ProjectCard";
import BuilderCard from "@/app/components/BuilderCard";
import LocalityCard from "@/app/components/LocalityCard";
import { StatCard } from "@/app/components/ui/StatCard";
import { ConfigurationDistribution, PropertyTypeDistribution, TransactionLineChart, TransactionVolumeChart } from "@/app/components/charts/TransactionCharts";
import ReportHeader from "@/app/components/reports/ReportHeader";
import ReportSection from "@/app/components/reports/ReportSection";
import MarketSummaryCard from "@/app/components/reports/MarketSummaryCard";
import ComparisonStat from "@/app/components/reports/ComparisonStat";
import HistoricalTable from "@/app/components/reports/HistoricalTable";
import RelatedSection from "@/app/components/reports/RelatedSection";

export const metadata: Metadata = {
  title: "Transaction Report — NoDalalTalks",
  description: "Aggregate registered-transaction activity, pricing distribution and configuration mix across Mumbai.",
};
export const dynamic = "force-dynamic";

const NAV_SECTIONS = [
  { id: "summary", label: "Summary" },
  { id: "kpis", label: "KPIs" },
  { id: "charts", label: "Charts" },
  { id: "comparisons", label: "Comparisons" },
  { id: "historical", label: "Historical" },
  { id: "related-projects", label: "Projects" },
  { id: "related-developers", label: "Developers" },
  { id: "related-localities", label: "Localities" },
];

export default async function TransactionReportPage() {
  const [snapshot, stats, monthlyTrend, configDistribution, propertyTypes, topProjects, activeDevelopers, localities] = await Promise.all([
    getMarketSnapshot(),
    getTransactionStats({}),
    getTransactionMonthlyTrend({}, 12),
    getTransactionConfigurationDistribution({}),
    getTransactionPropertyTypeDistribution({}),
    getTopProjectsByActivity(6),
    getRecentlyActiveDevelopers(4),
    getPublicLocalitiesPaged({ pageSize: 4, sortBy: "projects_desc" }),
  ]);

  const summary = AnalyticsService.Market.calculateMarketSummary({
    scopeName: "Mumbai's transaction market",
    liveProjectsCount: snapshot.liveProjectsCount,
    localitiesCount: snapshot.localitiesCount,
    buildersCount: snapshot.buildersCount,
    transactionsCount: snapshot.transactionsCount,
    transactions90dCount: snapshot.transactions90dCount,
    growthPercentYoy: null,
  });

  const lastTwoMonths = monthlyTrend.slice(-2);
  const momDelta =
    lastTwoMonths.length === 2 && lastTwoMonths[0].avgPricePaise !== null && lastTwoMonths[1].avgPricePaise !== null
      ? AnalyticsService.Market.calculateGrowthPercent(lastTwoMonths[0].avgPricePaise, lastTwoMonths[1].avgPricePaise)
      : null;
  const volumeDelta =
    lastTwoMonths.length === 2 ? AnalyticsService.Market.calculateGrowthPercent(lastTwoMonths[0].count, lastTwoMonths[1].count) : null;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Reports", href: "/reports" }, { label: "Transaction Report" }]} />

      <ReportHeader
        kicker="Transaction Report"
        title="Mumbai Transaction Activity"
        subtitle="Aggregate registered-transaction intelligence across the market"
        meta={[
          { label: "Total transactions", value: String(stats.totalTransactions) },
          { label: "Median price", value: formatPaise(stats.medianPricePaise) },
          { label: "Avg ₹/sqft", value: formatPricePerSqft(stats.avgPricePerSqftPaise) },
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total transactions" value={String(stats.totalTransactions)} accent />
            <StatCard label="Median price" value={formatPaise(stats.medianPricePaise)} />
            <StatCard label="Average price" value={formatPaise(stats.avgPricePaise)} />
            <StatCard label="Avg ₹/sqft" value={formatPricePerSqft(stats.avgPricePerSqftPaise)} />
            <StatCard label="Highest sale" value={formatPaise(stats.highestPricePaise)} />
            <StatCard label="Lowest sale" value={formatPaise(stats.lowestPricePaise)} />
            <StatCard label="Avg unit size" value={stats.avgUnitSizeSqft !== null ? `${Math.round(stats.avgUnitSizeSqft)} sqft` : "--"} />
            <StatCard label="Sales volume" value={formatPaise(stats.totalSalesVolumePaise)} />
          </div>
        </ReportSection>

        <ReportSection id="charts" title="Charts & Trends">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Monthly Transaction Volume</p>
              <div className="mt-3">
                <TransactionVolumeChart points={monthlyTrend.map((p) => ({ month: p.month.toISOString(), count: p.count }))} />
              </div>
            </div>
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Average Price Trend</p>
              <div className="mt-3">
                <TransactionLineChart points={monthlyTrend.map((p) => ({ month: p.month.toISOString(), value: p.avgPricePaise }))} ariaLabel="Average transaction price trend" />
              </div>
            </div>
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Configuration Mix</p>
              <div className="mt-3">
                <ConfigurationDistribution buckets={configDistribution} />
              </div>
            </div>
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Property Type Mix</p>
              <div className="mt-3">
                <PropertyTypeDistribution buckets={propertyTypes} />
              </div>
            </div>
          </div>
        </ReportSection>

        <ReportSection id="comparisons" title="Comparisons" description="Latest month vs the prior month">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ComparisonStat
              label="Average price"
              value={lastTwoMonths[1] ? formatPaise(lastTwoMonths[1].avgPricePaise) : "--"}
              baselineLabel="Prior month"
              baselineValue={lastTwoMonths[0] ? formatPaise(lastTwoMonths[0].avgPricePaise) : "--"}
              deltaPercent={momDelta}
            />
            <ComparisonStat
              label="Transaction volume"
              value={lastTwoMonths[1] ? String(lastTwoMonths[1].count) : "--"}
              baselineLabel="Prior month"
              baselineValue={lastTwoMonths[0] ? String(lastTwoMonths[0].count) : "--"}
              deltaPercent={volumeDelta}
            />
          </div>
        </ReportSection>

        <ReportSection id="historical" title="Historical Data" description="Monthly transaction volume and pricing, last 12 months">
          <HistoricalTable
            columnLabels={["Transactions", "Avg price", "Avg ₹/sqft"]}
            rows={monthlyTrend.map((p) => ({
              label: formatMonth(p.month),
              values: [String(p.count), formatPaise(p.avgPricePaise), formatPricePerSqft(p.avgPricePerSqftPaise)],
            }))}
          />
        </ReportSection>

        <RelatedSection id="related-projects" title="Most Active Projects" isEmpty={topProjects.length === 0} emptyMessage="No transaction activity recorded yet.">
          {topProjects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </RelatedSection>

        <RelatedSection id="related-developers" title="Recently Active Developers" isEmpty={activeDevelopers.length === 0} emptyMessage="No recent developer activity yet.">
          {activeDevelopers.map((b) => (
            <BuilderCard key={b.slug} builder={b} />
          ))}
        </RelatedSection>

        <RelatedSection id="related-localities" title="Related Localities" isEmpty={localities.items.length === 0} emptyMessage="No published localities yet.">
          {localities.items.map((l) => (
            <LocalityCard key={l.id} locality={l} />
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
