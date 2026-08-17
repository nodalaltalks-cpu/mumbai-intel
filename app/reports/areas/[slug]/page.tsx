import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getLocalityIntelligence,
  getMarketBaseline,
  getNearbyLocalities,
  getPublicLocalityBySlug,
  getTopBuildersForLocality,
  getTransactionConfigurationDistribution,
  getTransactionMonthlyTrend,
  getTransactionPropertyTypeDistribution,
  getTransactionStats,
} from "@/lib/queries";
import { getLocalityPriceTrend } from "@/lib/admin-queries";
import { AnalyticsService } from "@/lib/analytics";
import { formatMonth, formatPaise, formatPricePerSqft, formatSignedPercent } from "@/lib/format";
import Navbar from "@/app/components/Navbar";
import GAPageEvent from "@/app/components/analytics/GAPageEvent";
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
import { gated, maskPaise, maskPercent, maskPricePerSqft, maskProjectBrochure, maskScore } from "@/lib/premium/mask";
import { recordResearchEvent } from "@/lib/analytics/research-events";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const locality = await getPublicLocalityBySlug(slug);
  if (!locality) return { title: "Area report not found — NoDalalTalks" };
  return {
    title: `${locality.name} Area Report — NoDalalTalks`,
    description: `Demand, supply and price-trend analysis for ${locality.name}.`,
    alternates: { canonical: `/localities/${locality.slug}` },
  };
}

const NAV_SECTIONS = [
  { id: "summary", label: "Summary" },
  { id: "kpis", label: "KPIs" },
  { id: "charts", label: "Charts" },
  { id: "comparisons", label: "Comparisons" },
  { id: "historical", label: "Historical" },
  { id: "related-projects", label: "Projects" },
  { id: "related-developers", label: "Developers" },
  { id: "related-localities", label: "Nearby Areas" },
];

export default async function AreaReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locality = await getPublicLocalityBySlug(slug);
  if (!locality) notFound();
  await recordResearchEvent("REPORT_VIEWED", { entityType: "Locality", entityId: locality.id, metadata: { reportType: "area" } });

  const filters = { localityId: locality.id };
  const [stats, monthlyTrend, propertyTypes, configurations, intelligence, priceTrend, topBuilders, nearbyLocalities, baseline, session] = await Promise.all([
    getTransactionStats(filters),
    getTransactionMonthlyTrend(filters, 12),
    getTransactionPropertyTypeDistribution(filters),
    getTransactionConfigurationDistribution(filters),
    getLocalityIntelligence(locality.id, locality.name, locality.investmentScore, locality.rentalYieldPercent, locality.growthPercentYoy),
    getLocalityPriceTrend(locality.id),
    getTopBuildersForLocality(locality.id, 4),
    getNearbyLocalities(locality.id, 4),
    getMarketBaseline(),
    getPublicSession(),
  ]);
  const locked = session === null;
  const next = `/reports/areas/${locality.slug}`;

  const priceDelta = AnalyticsService.Market.calculateGrowthPercent(baseline.avgPricePerSqftPaise ?? 0, Number(locality.avgPricePerSqftPaise ?? 0));
  const growthDelta =
    baseline.avgGrowthPercentYoy !== null && locality.growthPercentYoy !== null
      ? AnalyticsService.Market.calculateGrowthPercent(baseline.avgGrowthPercentYoy, locality.growthPercentYoy)
      : null;
  const investmentDelta =
    baseline.avgLocalityInvestmentScore !== null && intelligence.investmentScore !== null
      ? AnalyticsService.Market.calculateGrowthPercent(baseline.avgLocalityInvestmentScore, intelligence.investmentScore)
      : null;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <GAPageEvent event="report_viewed" params={{ report_type: "area", entity_name: locality.name }} />
      <Navbar />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Reports", href: "/reports" }, { label: `${locality.name} Area Report` }]} />

      <ReportHeader
        kicker="Area Report"
        title={locality.name}
        subtitle={`${locality.zone ? `${locality.zone.name} · ` : ""}${locality.city.name}`}
        meta={[
          { label: "Avg price", value: gated(locked, formatPricePerSqft(locality.avgPricePerSqftPaise), maskPricePerSqft()) },
          { label: "YoY growth", value: gated(locked, formatSignedPercent(locality.growthPercentYoy), maskPercent()) },
          { label: "Projects", value: String(locality.projects.length) },
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
          <MarketSummaryCard summary={intelligence.summary} locked={locked} />
        </ReportSection>

        <ReportSection id="kpis" title="Key Performance Indicators">
          <PremiumGate locked={locked} feature="locality-analytics" next={next}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Avg price/sqft" value={gated(locked, formatPricePerSqft(locality.avgPricePerSqftPaise), maskPricePerSqft())} accent />
              <StatCard label="YoY growth" value={gated(locked, formatSignedPercent(locality.growthPercentYoy), maskPercent())} />
              <StatCard label="Rental yield" value={gated(locked, locality.rentalYieldPercent !== null ? `${locality.rentalYieldPercent}%` : "--", maskPercent())} />
              <StatCard label="Investment score" value={gated(locked, intelligence.investmentScore !== null ? `${intelligence.investmentScore.toFixed(1)}/10` : "--", maskScore())} />
              <StatCard label="Transactions (total)" value={String(stats.totalTransactions)} />
              <StatCard label="Demand" value={gated(locked, intelligence.demandLabel, "──")} />
              <StatCard label="Supply" value={gated(locked, intelligence.supplyLabel, "──")} />
              <StatCard label="Avg transaction value" value={gated(locked, formatPaise(stats.avgPricePaise), maskPaise())} />
            </div>
          </PremiumGate>
        </ReportSection>

        <ReportSection id="charts" title="Charts & Trends">
          <PremiumGate locked={locked} feature="market-analytics" next={next}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-sm border border-border bg-surface p-4">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">Monthly Price Trend</p>
                <div className="mt-3">
                  <TransactionLineChart points={locked ? [] : monthlyTrend.map((p) => ({ month: p.month.toISOString(), value: p.avgPricePerSqftPaise }))} ariaLabel="Monthly average price per square foot" />
                </div>
              </div>
              <div className="rounded-sm border border-border bg-surface p-4">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">Monthly Transaction Volume</p>
                <div className="mt-3">
                  <TransactionVolumeChart points={locked ? [] : monthlyTrend.map((p) => ({ month: p.month.toISOString(), count: p.count }))} />
                </div>
              </div>
              <div className="rounded-sm border border-border bg-surface p-4">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">Configuration Mix</p>
                <div className="mt-3">
                  <ConfigurationDistribution buckets={locked ? [] : configurations} />
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

        <ReportSection id="comparisons" title="Comparisons" description="This area vs the Mumbai market average">
          <PremiumGate locked={locked} feature="locality-analytics" next={next}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <ComparisonStat
                label="Price per sqft"
                value={gated(locked, formatPricePerSqft(locality.avgPricePerSqftPaise), maskPricePerSqft())}
                baselineLabel="Mumbai avg"
                baselineValue={gated(locked, formatPricePerSqft(baseline.avgPricePerSqftPaise), maskPricePerSqft())}
                deltaPercent={locked ? null : priceDelta}
              />
              <ComparisonStat
                label="YoY growth"
                value={gated(locked, formatSignedPercent(locality.growthPercentYoy), maskPercent())}
                baselineLabel="Mumbai avg"
                baselineValue={gated(locked, formatSignedPercent(baseline.avgGrowthPercentYoy), maskPercent())}
                deltaPercent={locked ? null : growthDelta}
              />
              <ComparisonStat
                label="Investment score"
                value={gated(locked, intelligence.investmentScore !== null ? `${intelligence.investmentScore.toFixed(1)}/10` : "--", maskScore())}
                baselineLabel="Mumbai avg"
                baselineValue={gated(locked, baseline.avgLocalityInvestmentScore !== null ? `${baseline.avgLocalityInvestmentScore.toFixed(1)}/10` : "--", maskScore())}
                deltaPercent={locked ? null : investmentDelta}
              />
            </div>
          </PremiumGate>
        </ReportSection>

        <ReportSection id="historical" title="Historical Data" description="Analyst-verified monthly average, independent of the filters above">
          <PremiumGate locked={locked} feature="transaction-history" next={next}>
            <HistoricalTable
              columnLabels={["Avg ₹/sqft"]}
              rows={priceTrend.map((p) => ({ label: gated(locked, formatMonth(p.month), "──"), values: [gated(locked, formatPricePerSqft(p.avgPricePerSqftPaise), maskPricePerSqft())] }))}
            />
          </PremiumGate>
        </ReportSection>

        <RelatedSection id="related-projects" title="Related Projects" isEmpty={locality.projects.length === 0} emptyMessage="No published projects in this area yet.">
          {locality.projects.slice(0, 8).map((p) => (
            <ProjectCard key={p.id} project={maskProjectBrochure(p, locked)} />
          ))}
        </RelatedSection>

        <RelatedSection id="related-developers" title="Related Developers" isEmpty={topBuilders.length === 0} emptyMessage="No developer data for this area yet.">
          {topBuilders.map((b) => (
            <BuilderCard key={b.slug} builder={{ slug: b.slug, name: b.name, logoUrl: b.logoUrl, overallScore: b.score, projectCount: b.projectCount }} locked={locked} />
          ))}
        </RelatedSection>

        <RelatedSection id="related-localities" title="Related Localities" isEmpty={nearbyLocalities.length === 0} emptyMessage="No nearby areas published yet.">
          {nearbyLocalities.map((l) => (
            <LocalityCard key={l.id} locality={l} locked={locked} />
          ))}
        </RelatedSection>
      </main>

      <Footer />
    </div>
  );
}
