import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getLocalitiesForBuilder,
  getMarketBaseline,
  getPublicBuilderBySlug,
  getTopDevelopers,
  getTransactionMonthlyTrend,
  getTransactionStats,
} from "@/lib/queries";
import { AnalyticsService } from "@/lib/analytics";
import { formatDate, formatPaise, formatPricePerSqft } from "@/lib/format";
import { STATUS_LABEL, type ProjectStatus } from "@/lib/project-meta";
import Navbar from "@/app/components/Navbar";
import GAPageEvent from "@/app/components/analytics/GAPageEvent";
import Footer from "@/app/components/Footer";
import Breadcrumbs from "@/app/components/Breadcrumbs";
import ProjectCard from "@/app/components/ProjectCard";
import BuilderCard from "@/app/components/BuilderCard";
import LocalityCard from "@/app/components/LocalityCard";
import { StatCard } from "@/app/components/ui/StatCard";
import { LabeledDistributionBars, TransactionLineChart, TransactionVolumeChart } from "@/app/components/charts/TransactionCharts";
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
  const builder = await getPublicBuilderBySlug(slug);
  if (!builder) return { title: "Developer report not found - NoDalalTalks" };
  return {
    title: `${builder.name} Developer Report - NoDalalTalks`,
    description: `Portfolio breakdown, delivery track record and market presence for ${builder.name}.`,
    alternates: { canonical: `/builders/${builder.slug}` },
  };
}

const NAV_SECTIONS = [
  { id: "summary", label: "Summary" },
  { id: "kpis", label: "KPIs" },
  { id: "charts", label: "Charts" },
  { id: "comparisons", label: "Comparisons" },
  { id: "historical", label: "Historical" },
  { id: "related-projects", label: "Projects" },
  { id: "related-developers", label: "Peers" },
  { id: "related-localities", label: "Localities" },
];

export default async function DeveloperReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const builder = await getPublicBuilderBySlug(slug);
  if (!builder) notFound();
  await recordResearchEvent("REPORT_VIEWED", { entityType: "Builder", entityId: builder.id, metadata: { reportType: "developer" } });

  const filters = { builderId: builder.id };
  const [txStats, monthlyTrend, relatedLocalities, peerDevelopers, baseline, session] = await Promise.all([
    getTransactionStats(filters),
    getTransactionMonthlyTrend(filters, 12),
    getLocalitiesForBuilder(builder.id, 4),
    getTopDevelopers(5),
    getMarketBaseline(),
    getPublicSession(),
  ]);
  const locked = session === null;
  const next = `/reports/developers/${builder.slug}`;

  const latestScore = builder.scoreSnapshots[0] ?? null;
  const otherPeerDevelopers = peerDevelopers.filter((p) => p.slug !== builder.slug).slice(0, 4);
  const summary = AnalyticsService.Developer.calculateMarketSummary({
    builderName: builder.name,
    totalProjects: builder.projects.length,
    deliveredCount: builder.completedProjects.length,
    underConstructionCount: builder.underConstructionProjects.length,
    citiesServedCount: builder.citiesServed.length,
    onTimeDeliveryPct: latestScore?.onTimeDeliveryPct ?? null,
  });

  const scoreDelta =
    latestScore !== null && baseline.avgBuilderScore !== null
      ? AnalyticsService.Market.calculateGrowthPercent(baseline.avgBuilderScore, latestScore.overallScore)
      : null;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <GAPageEvent event="report_viewed" params={{ report_type: "developer", entity_name: builder.name }} />
      <Navbar />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Reports", href: "/reports" }, { label: `${builder.name} Report` }]} />

      <ReportHeader
        kicker="Developer Report"
        title={builder.name}
        subtitle={builder.headquarters ?? "Headquarters not specified"}
        meta={[
          { label: "Rating", value: gated(locked, latestScore ? `${latestScore.overallScore.toFixed(1)}/10` : "--", maskScore()) },
          { label: "Investment score", value: gated(locked, builder.investmentScore !== null ? `${builder.investmentScore.toFixed(1)}/10` : "--", maskScore()) },
          { label: "Projects", value: String(builder.projects.length) },
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
            <StatCard label="Total projects" value={String(builder.projects.length)} accent />
            <StatCard label="Delivered" value={String(builder.completedProjects.length)} />
            <StatCard label="Under construction" value={String(builder.underConstructionProjects.length)} />
            <StatCard label="Upcoming" value={String(builder.upcomingProjects.length)} />
            <StatCard label="Investment score" value={gated(locked, builder.investmentScore !== null ? `${builder.investmentScore.toFixed(1)}/10` : "--", maskScore())} />
            <StatCard
              label="On-time delivery"
              value={gated(
                locked,
                latestScore?.onTimeDeliveryPct !== null && latestScore?.onTimeDeliveryPct !== undefined ? `${latestScore.onTimeDeliveryPct}%` : "--",
                maskPercent()
              )}
            />
            <StatCard label="Years in business" value={builder.yearsInBusiness !== null ? String(builder.yearsInBusiness) : "--"} />
            <StatCard label="Cities served" value={String(builder.citiesServed.length)} />
          </div>
        </ReportSection>

        <ReportSection id="charts" title="Charts & Trends">
          <PremiumGate locked={locked} feature="builder-analytics" next={next}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-sm border border-border bg-surface p-4">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">Projects by Status</p>
                <div className="mt-3">
                  <LabeledDistributionBars buckets={locked ? [] : builder.projectsByStatus.map((s) => ({ label: STATUS_LABEL[s.status as ProjectStatus], count: s.count }))} />
                </div>
              </div>
              <div className="rounded-sm border border-border bg-surface p-4">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">Transaction Volume (Monthly)</p>
                <div className="mt-3">
                  <TransactionVolumeChart points={locked ? [] : monthlyTrend.map((p) => ({ month: p.month.toISOString(), count: p.count }))} />
                </div>
              </div>
              <div className="rounded-sm border border-border bg-surface p-4 lg:col-span-2">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">Average Price Trend</p>
                <div className="mt-3">
                  <TransactionLineChart points={locked ? [] : monthlyTrend.map((p) => ({ month: p.month.toISOString(), value: p.avgPricePaise }))} ariaLabel="Average transaction price trend" />
                </div>
              </div>
            </div>
          </PremiumGate>
        </ReportSection>

        <ReportSection id="comparisons" title="Comparisons" description="This developer's trust score vs the Mumbai market average">
          <PremiumGate locked={locked} feature="builder-analytics" next={next}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ComparisonStat
                label="Trust score"
                value={gated(locked, latestScore ? `${latestScore.overallScore.toFixed(1)}/10` : "--", maskScore())}
                baselineLabel="Mumbai avg"
                baselineValue={gated(locked, baseline.avgBuilderScore !== null ? `${baseline.avgBuilderScore.toFixed(1)}/10` : "--", maskScore())}
                deltaPercent={locked ? null : scoreDelta}
              />
              <ComparisonStat
                label="Avg transaction value"
                value={gated(locked, formatPaise(txStats.avgPricePaise), maskPaise())}
                baselineLabel="Avg ₹/sqft citywide"
                baselineValue={gated(locked, formatPricePerSqft(baseline.avgPricePerSqftPaise), maskPricePerSqft())}
                deltaPercent={null}
              />
            </div>
          </PremiumGate>
        </ReportSection>

        <ReportSection id="historical" title="Historical Data" description="Trust score snapshots over time">
          <PremiumGate locked={locked} feature="builder-analytics" next={next}>
            <HistoricalTable
              columnLabels={["Score", "On-time delivery", "Delivered", "Active"]}
              rows={builder.scoreSnapshots.map((s) => ({
                label: gated(locked, formatDate(s.asOf), "──"),
                values: [
                  gated(locked, s.overallScore.toFixed(1), maskScore()),
                  gated(locked, s.onTimeDeliveryPct !== null ? `${s.onTimeDeliveryPct}%` : "--", maskPercent()),
                  gated(locked, String(s.deliveredProjects), "──"),
                  gated(locked, String(s.activeProjects), "──"),
                ],
              }))}
            />
          </PremiumGate>
        </ReportSection>

        <RelatedSection id="related-projects" title="Related Projects" isEmpty={builder.projects.length === 0} emptyMessage="No published projects yet.">
          {builder.projects.slice(0, 8).map((p) => (
            <ProjectCard key={p.id} project={maskProjectBrochure(p, locked)} />
          ))}
        </RelatedSection>

        <RelatedSection id="related-developers" title="Related Developers" isEmpty={otherPeerDevelopers.length === 0} emptyMessage="No peer developers to show yet.">
          {otherPeerDevelopers.map((d) => (
            <BuilderCard key={d.slug} builder={d} locked={locked} />
          ))}
        </RelatedSection>

        <RelatedSection id="related-localities" title="Related Localities" isEmpty={relatedLocalities.length === 0} emptyMessage="No published localities linked yet.">
          {relatedLocalities.map((l) => (
            <LocalityCard key={l.id} locality={l} locked={locked} />
          ))}
        </RelatedSection>
      </main>

      <Footer />
    </div>
  );
}
