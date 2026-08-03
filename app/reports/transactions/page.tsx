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
import PremiumGate from "@/app/components/premium/PremiumGate";
import { getPublicSession } from "@/lib/public-auth/session";
import { gated, maskPaise, maskPricePerSqft, maskProjectBrochure } from "@/lib/premium/mask";

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
  const [snapshot, stats, monthlyTrend, configDistribution, propertyTypes, topProjects, activeDevelopers, localities, session] = await Promise.all([
    getMarketSnapshot(),
    getTransactionStats({}),
    getTransactionMonthlyTrend({}, 12),
    getTransactionConfigurationDistribution({}),
    getTransactionPropertyTypeDistribution({}),
    getTopProjectsByActivity(6),
    getRecentlyActiveDevelopers(4),
    getPublicLocalitiesPaged({ pageSize: 4, sortBy: "projects_desc" }),
    getPublicSession(),
  ]);
  const locked = session === null;
  const next = "/reports/transactions";

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
          { label: "Median price", value: gated(locked, formatPaise(stats.medianPricePaise), maskPaise()) },
          { label: "Avg ₹/sqft", value: gated(locked, formatPricePerSqft(stats.avgPricePerSqftPaise), maskPricePerSqft()) },
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
          <MarketSummaryCard summary={summary} locked={locked} />
        </ReportSection>

        <ReportSection id="kpis" title="Key Performance Indicators">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total transactions" value={String(stats.totalTransactions)} accent />
            <StatCard label="Median price" value={gated(locked, formatPaise(stats.medianPricePaise), maskPaise())} />
            <StatCard label="Average price" value={gated(locked, formatPaise(stats.avgPricePaise), maskPaise())} />
            <StatCard label="Avg ₹/sqft" value={gated(locked, formatPricePerSqft(stats.avgPricePerSqftPaise), maskPricePerSqft())} />
            <StatCard label="Highest sale" value={gated(locked, formatPaise(stats.highestPricePaise), maskPaise())} />
            <StatCard label="Lowest sale" value={gated(locked, formatPaise(stats.lowestPricePaise), maskPaise())} />
            <StatCard label="Avg unit size" value={stats.avgUnitSizeSqft !== null ? `${Math.round(stats.avgUnitSizeSqft)} sqft` : "--"} />
            <StatCard label="Sales volume" value={gated(locked, formatPaise(stats.totalSalesVolumePaise), maskPaise())} />
          </div>
        </ReportSection>

        <ReportSection id="charts" title="Charts & Trends">
          <PremiumGate locked={locked} feature="market-analytics" next={next}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-sm border border-border bg-surface p-4">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">Monthly Transaction Volume</p>
                <div className="mt-3">
                  <TransactionVolumeChart points={locked ? [] : monthlyTrend.map((p) => ({ month: p.month.toISOString(), count: p.count }))} />
                </div>
              </div>
              <div className="rounded-sm border border-border bg-surface p-4">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">Average Price Trend</p>
                <div className="mt-3">
                  <TransactionLineChart points={locked ? [] : monthlyTrend.map((p) => ({ month: p.month.toISOString(), value: p.avgPricePaise }))} ariaLabel="Average transaction price trend" />
                </div>
              </div>
              <div className="rounded-sm border border-border bg-surface p-4">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">Configuration Mix</p>
                <div className="mt-3">
                  <ConfigurationDistribution buckets={locked ? [] : configDistribution} />
                </div>
              </div>
              <div className="rounded-sm border border-border bg-surface p-4">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">Property Type Mix</p>
                <div className="mt-3">
                  <PropertyTypeDistribution buckets={locked ? [] : propertyTypes} />
                </div>
              </div>
            </div>
          </PremiumGate>
        </ReportSection>

        <ReportSection id="comparisons" title="Comparisons" description="Latest month vs the prior month">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PremiumGate locked={locked} feature="market-analytics" next={next}>
              <ComparisonStat
                label="Average price"
                value={gated(locked, lastTwoMonths[1] ? formatPaise(lastTwoMonths[1].avgPricePaise) : "--", maskPaise())}
                baselineLabel="Prior month"
                baselineValue={gated(locked, lastTwoMonths[0] ? formatPaise(lastTwoMonths[0].avgPricePaise) : "--", maskPaise())}
                deltaPercent={locked ? null : momDelta}
              />
            </PremiumGate>
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
              values: [String(p.count), gated(locked, formatPaise(p.avgPricePaise), maskPaise()), gated(locked, formatPricePerSqft(p.avgPricePerSqftPaise), maskPricePerSqft())],
            }))}
          />
        </ReportSection>

        <RelatedSection id="related-projects" title="Most Active Projects" isEmpty={topProjects.length === 0} emptyMessage="No transaction activity recorded yet.">
          {topProjects.map((p) => {
            const gatedProject = maskProjectBrochure(p, locked);
            return <ProjectCard key={p.id} project={gatedProject} />;
          })}
        </RelatedSection>

        <RelatedSection id="related-developers" title="Recently Active Developers" isEmpty={activeDevelopers.length === 0} emptyMessage="No recent developer activity yet.">
          {activeDevelopers.map((b) => (
            <BuilderCard key={b.slug} builder={b} locked={locked} />
          ))}
        </RelatedSection>

        <RelatedSection id="related-localities" title="Related Localities" isEmpty={localities.items.length === 0} emptyMessage="No published localities yet.">
          {localities.items.map((l) => (
            <LocalityCard key={l.id} locality={l} locked={locked} />
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
