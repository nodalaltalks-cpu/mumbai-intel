import type { Metadata } from "next";
import {
  getPublicTransactionsPaged,
  getTransactionStats,
  getTransactionMonthlyTrend,
  getTransactionPropertyTypeDistribution,
  type PublicTransactionFilters,
} from "@/lib/queries";
import { getBuildersForSelect, getLocalitiesForSelect, getProjectsForSelect } from "@/lib/admin-queries";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import TransactionFilters from "@/app/components/TransactionFilters";
import TransactionTable from "@/app/components/TransactionTable";
import TransactionStats from "@/app/components/TransactionStats";
import { PropertyTypeDistribution, TransactionLineChart, TransactionVolumeChart } from "@/app/components/charts/TransactionCharts";
import Pagination from "@/app/admin/components/Pagination";
import EmptyState from "@/app/components/ui/EmptyState";
import PremiumGate from "@/app/components/premium/PremiumGate";
import { getPublicSession } from "@/lib/public-auth/session";

export const metadata: Metadata = {
  title: "Transactions — NoDalalTalks",
  description: "Registered Mumbai real estate sale, resale and lease transactions with price and configuration filters.",
  alternates: { canonical: "/transactions" },
};
export const dynamic = "force-dynamic";

interface TransactionSearchParams {
  q?: string;
  locality?: string;
  builder?: string;
  project?: string;
  category?: string;
  bedrooms?: string;
  priceMin?: string;
  priceMax?: string;
  areaMin?: string;
  areaMax?: string;
  dateFrom?: string;
  dateTo?: string;
  type?: string;
  readiness?: string;
  sort?: string;
  page?: string;
}

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<TransactionSearchParams> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const filters: PublicTransactionFilters = {
    q: params.q,
    localityId: params.locality,
    builderId: params.builder,
    projectId: params.project,
    category: params.category,
    bedrooms: params.bedrooms,
    priceMinRupees: params.priceMin ? Number(params.priceMin) : undefined,
    priceMaxRupees: params.priceMax ? Number(params.priceMax) : undefined,
    areaMinSqft: params.areaMin ? Number(params.areaMin) : undefined,
    areaMaxSqft: params.areaMax ? Number(params.areaMax) : undefined,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    type: params.type,
    readiness: params.readiness,
    sortBy: params.sort,
  };

  const [{ items: transactions, total, totalPages }, stats, monthlyTrend, propertyTypes, localities, builders, projects, session] = await Promise.all([
    getPublicTransactionsPaged({ ...filters, page, pageSize: 20 }),
    getTransactionStats(filters),
    getTransactionMonthlyTrend(filters, 12),
    getTransactionPropertyTypeDistribution(filters),
    getLocalitiesForSelect(),
    getBuildersForSelect(),
    getProjectsForSelect(),
    getPublicSession(),
  ]);
  const locked = session === null;
  const next = `/transactions${params.page || params.q ? `?${new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString()}` : ""}`;

  function buildHref(targetPage: number) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "page") continue;
      if (value) qs.set(key, value);
    }
    if (targetPage > 1) qs.set("page", String(targetPage));
    const qsString = qs.toString();
    return qsString ? `/transactions?${qsString}` : "/transactions";
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />
      <TransactionFilters
        localities={localities.map((l) => ({ id: l.id, name: l.name }))}
        builders={builders}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      />

      <main id="main-content" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">
            {total} transaction{total === 1 ? "" : "s"}
          </h1>
          <p className="text-xs text-muted">Registered sale, resale and lease transactions across Mumbai.</p>
        </div>

        <PremiumGate locked={locked} feature="transaction-history" next={next}>
          <TransactionStats stats={stats} locked={locked} />
        </PremiumGate>

        <PremiumGate locked={locked} feature="market-analytics" next={next}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Monthly Transactions</p>
              <div className="mt-3">
                <TransactionVolumeChart points={locked ? [] : monthlyTrend.map((p) => ({ month: p.month.toISOString(), count: p.count }))} />
              </div>
            </div>
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Average Price Trend</p>
              <div className="mt-3">
                <TransactionLineChart
                  points={locked ? [] : monthlyTrend.map((p) => ({ month: p.month.toISOString(), value: p.avgPricePaise }))}
                  ariaLabel="Average transaction price trend"
                />
              </div>
            </div>
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Property Type Distribution</p>
              <div className="mt-3">
                <PropertyTypeDistribution buckets={locked ? [] : propertyTypes} />
              </div>
            </div>
          </div>
        </PremiumGate>

        <PremiumGate locked={locked} feature="market-analytics" next={next}>
          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="font-mono text-xs uppercase tracking-wide text-muted">Median Price Trend</p>
            <div className="mt-3">
              <TransactionLineChart
                points={locked ? [] : monthlyTrend.map((p) => ({ month: p.month.toISOString(), value: p.medianPricePaise }))}
                ariaLabel="Median transaction price trend"
              />
            </div>
          </div>
        </PremiumGate>

        {transactions.length === 0 ? (
          <EmptyState title="No transactions match these filters" message="Try widening your search or resetting filters." />
        ) : (
          <PremiumGate locked={locked} feature="transaction-history" next={next}>
            <TransactionTable transactions={transactions} locked={locked} />
          </PremiumGate>
        )}

        <Pagination page={page} totalPages={totalPages} total={total} buildHref={buildHref} />
      </main>

      <Footer />
    </div>
  );
}
