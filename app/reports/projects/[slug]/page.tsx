import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  computeProjectInvestmentScore,
  getMarketBaseline,
  getNearbyLocalities,
  getProjectPriceHistory,
  getPublicProjectBySlug,
  getRelatedProjects,
  getTopBuildersForLocality,
  getTransactionConfigurationDistribution,
  getTransactionMonthlyTrend,
  getTransactionStats,
} from "@/lib/queries";
import { AnalyticsService } from "@/lib/analytics";
import { formatMonth, formatPaise, formatPriceBand, formatPricePerSqft } from "@/lib/format";
import { CATEGORY_LABEL, STATUS_LABEL } from "@/lib/project-meta";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import Breadcrumbs from "@/app/components/Breadcrumbs";
import ProjectCard from "@/app/components/ProjectCard";
import BuilderCard from "@/app/components/BuilderCard";
import LocalityCard from "@/app/components/LocalityCard";
import { StatCard } from "@/app/components/ui/StatCard";
import { ConfigurationDistribution, TransactionLineChart, TransactionVolumeChart } from "@/app/components/charts/TransactionCharts";
import ReportHeader from "@/app/components/reports/ReportHeader";
import ReportSection from "@/app/components/reports/ReportSection";
import MarketSummaryCard from "@/app/components/reports/MarketSummaryCard";
import ComparisonStat from "@/app/components/reports/ComparisonStat";
import HistoricalTable from "@/app/components/reports/HistoricalTable";
import RelatedSection from "@/app/components/reports/RelatedSection";
import PremiumGate from "@/app/components/premium/PremiumGate";
import { getPublicSession } from "@/lib/public-auth/session";
import { gated, maskPaise, maskPricePerSqft, maskProjectBrochure, maskScore } from "@/lib/premium/mask";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(slug);
  if (!project) return { title: "Project report not found — NoDalalTalks" };
  return {
    title: `${project.name} Project Report — NoDalalTalks`,
    description: `KPIs, price trends and transaction analysis for ${project.name}.`,
    alternates: { canonical: `/projects/${project.slug}` },
  };
}

const NAV_SECTIONS = [
  { id: "summary", label: "Summary" },
  { id: "kpis", label: "KPIs" },
  { id: "charts", label: "Charts" },
  { id: "comparisons", label: "Comparisons" },
  { id: "historical", label: "Historical" },
  { id: "related-projects", label: "Related Projects" },
  { id: "related-developers", label: "Developers" },
  { id: "related-localities", label: "Localities" },
];

export default async function ProjectReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(slug);
  if (!project) notFound();

  const filters = { projectId: project.id };
  const [priceHistory, txStats, monthlyTrend, configDistribution, related, nearbyBuilders, nearbyLocalities, baseline, session] = await Promise.all([
    getProjectPriceHistory(project.id),
    getTransactionStats(filters),
    getTransactionMonthlyTrend(filters, 12),
    getTransactionConfigurationDistribution(filters),
    getRelatedProjects({ id: project.id, localityId: project.localityId, builderId: project.builderId }),
    getTopBuildersForLocality(project.localityId, 4),
    getNearbyLocalities(project.localityId, 4),
    getMarketBaseline(),
    getPublicSession(),
  ]);
  const locked = session === null;
  const next = `/reports/projects/${project.slug}`;

  const investmentScore = computeProjectInvestmentScore(project.localityInvestmentScore, project.builderOverallScore, txStats.totalTransactions);
  const otherNearbyBuilders = nearbyBuilders.filter((b) => b.slug !== project.builder?.slug);
  const summary = AnalyticsService.Project.calculateMarketSummary({
    projectName: project.name,
    localityName: project.locality.name,
    statusLabel: STATUS_LABEL[project.status],
    totalTransactions: txStats.totalTransactions,
    investmentScore,
  });

  const priceVsLocalityDelta =
    project.configPricePerSqftPaise !== null && project.locality.avgPricePerSqftPaise !== null
      ? AnalyticsService.Market.calculateGrowthPercent(Number(project.locality.avgPricePerSqftPaise), project.configPricePerSqftPaise)
      : null;
  const priceVsCityDelta =
    project.configPricePerSqftPaise !== null && baseline.avgPricePerSqftPaise !== null
      ? AnalyticsService.Market.calculateGrowthPercent(baseline.avgPricePerSqftPaise, project.configPricePerSqftPaise)
      : null;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Reports", href: "/reports" }, { label: `${project.name} Report` }]} />

      <ReportHeader
        kicker="Project Report"
        title={project.name}
        subtitle={`${project.locality.name}${project.builder ? ` · ${project.builder.name}` : ""} · ${STATUS_LABEL[project.status]}`}
        meta={[
          { label: "Price band", value: formatPriceBand(project.priceMinPaise, project.priceMaxPaise) },
          { label: "Price/sqft", value: gated(locked, formatPricePerSqft(project.configPricePerSqftPaise), maskPricePerSqft()) },
          { label: "Investment score", value: gated(locked, investmentScore !== null ? `${investmentScore.toFixed(1)}/10` : "--", maskScore()) },
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
            <StatCard label="Price band" value={formatPriceBand(project.priceMinPaise, project.priceMaxPaise)} accent />
            <StatCard label="Price/sqft" value={gated(locked, formatPricePerSqft(project.configPricePerSqftPaise), maskPricePerSqft())} />
            <StatCard label="Category" value={CATEGORY_LABEL[project.category]} />
            <StatCard label="Investment score" value={gated(locked, investmentScore !== null ? `${investmentScore.toFixed(1)}/10` : "--", maskScore())} />
            <StatCard label="Construction" value={project.constructionPercent !== null ? `${project.constructionPercent}%` : "--"} />
            <StatCard label="RERA" value={project.reraNumber ? "Registered" : "Not disclosed"} />
            <StatCard label="Total transactions" value={String(txStats.totalTransactions)} />
            <StatCard label="Avg transaction value" value={gated(locked, formatPaise(txStats.avgPricePaise), maskPaise())} />
          </div>
        </ReportSection>

        <ReportSection id="charts" title="Charts & Trends">
          <PremiumGate locked={locked} feature="market-analytics" next={next}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-sm border border-border bg-surface p-4">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">Price Trend</p>
                <div className="mt-3">
                  <TransactionLineChart points={locked ? [] : monthlyTrend.map((p) => ({ month: p.month.toISOString(), value: p.avgPricePerSqftPaise }))} ariaLabel="Average price per square foot trend" />
                </div>
              </div>
              <div className="rounded-sm border border-border bg-surface p-4">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">Transaction Volume</p>
                <div className="mt-3">
                  <TransactionVolumeChart points={locked ? [] : monthlyTrend.map((p) => ({ month: p.month.toISOString(), count: p.count }))} />
                </div>
              </div>
              <div className="rounded-sm border border-border bg-surface p-4 lg:col-span-2">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">Configuration Mix</p>
                <div className="mt-3">
                  <ConfigurationDistribution buckets={locked ? [] : configDistribution} />
                </div>
              </div>
            </div>
          </PremiumGate>
        </ReportSection>

        <ReportSection id="comparisons" title="Comparisons" description="This project's price/sqft vs its locality and the Mumbai market">
          <PremiumGate locked={locked} feature="market-analytics" next={next}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ComparisonStat
                label="Price per sqft vs locality"
                value={gated(locked, formatPricePerSqft(project.configPricePerSqftPaise), maskPricePerSqft())}
                baselineLabel={`${project.locality.name} avg`}
                baselineValue={gated(locked, formatPricePerSqft(project.locality.avgPricePerSqftPaise), maskPricePerSqft())}
                deltaPercent={locked ? null : priceVsLocalityDelta}
              />
              <ComparisonStat
                label="Price per sqft vs Mumbai"
                value={gated(locked, formatPricePerSqft(project.configPricePerSqftPaise), maskPricePerSqft())}
                baselineLabel="Mumbai avg"
                baselineValue={gated(locked, formatPricePerSqft(baseline.avgPricePerSqftPaise), maskPricePerSqft())}
                deltaPercent={locked ? null : priceVsCityDelta}
              />
            </div>
          </PremiumGate>
        </ReportSection>

        <ReportSection id="historical" title="Historical Data" description="Analyst-verified monthly average, independent of registered transactions">
          <PremiumGate locked={locked} feature="transaction-history" next={next}>
            <HistoricalTable
              columnLabels={["Avg ₹/sqft"]}
              rows={priceHistory.map((p) => ({ label: gated(locked, formatMonth(p.month), "──"), values: [gated(locked, formatPricePerSqft(p.avgPricePerSqftPaise), maskPricePerSqft())] }))}
            />
          </PremiumGate>
        </ReportSection>

        <RelatedSection id="related-projects" title="Related Projects" isEmpty={related.length === 0} emptyMessage="No related projects found yet.">
          {related.map((p) => (
            <ProjectCard key={p.id} project={maskProjectBrochure(p, locked)} />
          ))}
        </RelatedSection>

        <RelatedSection id="related-developers" title="Related Developers" isEmpty={otherNearbyBuilders.length === 0} emptyMessage="No other developers active in this locality yet.">
          {otherNearbyBuilders.map((b) => (
            <BuilderCard key={b.slug} builder={{ slug: b.slug, name: b.name, logoUrl: b.logoUrl, overallScore: b.score, projectCount: b.projectCount }} locked={locked} />
          ))}
        </RelatedSection>

        <RelatedSection id="related-localities" title="Related Localities" isEmpty={nearbyLocalities.length === 0} emptyMessage="No nearby localities published yet.">
          {nearbyLocalities.map((l) => (
            <LocalityCard key={l.id} locality={l} locked={locked} />
          ))}
        </RelatedSection>
      </main>

      <Footer />
    </div>
  );
}
