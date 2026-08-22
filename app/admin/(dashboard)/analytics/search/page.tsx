import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  getRecentSearches,
  getSearchSummary,
  getSearchTrend,
  getTopSearchTerms,
  getZeroResultSearches,
  getUniqueSearchers,
  getTrendingSearches,
  getSearchConversionRates,
  classifySearchIntent,
} from "@/lib/analytics/search-queries";
import { getLocalitiesForSelect, getBuildersForSelect, getProjectsForSelect } from "@/lib/admin-queries";
import { formatDateTime } from "@/lib/format";
import { ANALYTICS_PERIOD_COOKIE, computeChange, resolveAnalyticsPeriodFromRequest } from "@/lib/analytics/period";
import BarChart from "@/app/admin/components/charts/BarChart";
import AnalyticsPeriodFilter from "@/app/admin/components/AnalyticsPeriodFilter";
import AnalyticsStatCard from "@/app/admin/components/AnalyticsStatCard";

function RateTile({ label, percent }: { label: string; percent: number | null }) {
  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{percent !== null ? `${percent}%` : "--"}</p>
    </div>
  );
}

const INTENT_LABEL: Record<string, string> = {
  PROJECT: "Project",
  BUILDER: "Builder",
  LOCALITY: "Locality",
  PRICE: "Price",
  TRANSACTION: "Transaction",
  GENERAL: "General",
};

export const metadata: Metadata = { title: "Search Analytics — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const CONTEXT_LABEL: Record<string, string> = { projects: "Projects", transactions: "Transactions", both: "Projects + Transactions" };

export default async function SearchAnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const period = resolveAnalyticsPeriodFromRequest(params, cookieStore.get(ANALYTICS_PERIOD_COOKIE)?.value);

  const [summary, trend, topTerms, zeroResult, recent, uniqueSearchers, trending, conversion, localities, builders, projects] = await Promise.all([
    getSearchSummary(period),
    getSearchTrend(period),
    getTopSearchTerms(period, 20),
    getZeroResultSearches(period, 15),
    getRecentSearches(30),
    getUniqueSearchers(period),
    getTrendingSearches(period, 8),
    getSearchConversionRates(period),
    getLocalitiesForSelect(),
    getBuildersForSelect(),
    getProjectsForSelect(),
  ]);
  const change = computeChange(summary.totalSearches, summary.previousTotalSearches);
  const maxTermCount = Math.max(...topTerms.map((t) => t.count), 1);
  const catalogs = {
    localityNames: localities.map((l) => l.name),
    builderNames: builders.map((b) => b.name),
    projectNames: projects.map((p) => p.name),
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Search Analytics</h1>
          <p className="text-xs text-muted">
            Every search on Projects and Transactions, live from ResearchEvent — no invasive tracking, just what people typed —{" "}
            <Link href="/admin/analytics/research" className="text-accent hover:underline">
              Research Intent
            </Link>
          </p>
        </div>
        <AnalyticsPeriodFilter current={period.key} currentFrom={params.from} currentTo={params.to} label={period.label} dateRangeLabel={period.dateRangeLabel} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <AnalyticsStatCard label="Searches (period)" value={summary.totalSearches} previousValue={summary.previousTotalSearches} change={change} />
        <AnalyticsStatCard label="Unique searchers" value={uniqueSearchers} />
        <AnalyticsStatCard label="Unique terms" value={summary.uniqueTerms} />
        <AnalyticsStatCard label="Zero-result searches" value={summary.zeroResultCount} />
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Search-to-outcome rates</h2>
        <p className="mb-3 text-[11px] text-muted">
          Of users who searched this period, the share who also viewed a project / compared or saved / downloaded a brochure in the same period — an
          aggregate signal, not a per-search click trail (no per-search click is captured anywhere in this app).
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <RateTile label="Search → viewed a project" percent={conversion.viewedProjectRate} />
          <RateTile label="Search → compared / saved" percent={conversion.engagedRate} />
          <RateTile label="Search → downloaded brochure" percent={conversion.downloadedBrochureRate} />
        </div>
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Trending searches</h2>
        <p className="mb-3 text-[11px] text-muted">Change vs. the immediately preceding {period.label.toLowerCase()}-length window.</p>
        {trending.length === 0 ? (
          <p className="text-xs text-muted">No searches for this period.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {trending.map((t) => (
              <li key={t.query} className="flex items-center gap-1.5 rounded-sm border border-border bg-background px-2.5 py-1.5 text-xs">
                <span className="text-foreground">{t.query}</span>
                <span className={t.direction === "up" ? "font-mono text-positive" : t.direction === "down" ? "font-mono text-negative" : "font-mono text-muted"}>
                  {t.percent === null ? "new" : `${t.percent > 0 ? "+" : ""}${t.percent}%`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Search volume — {period.label}</h2>
        <BarChart data={trend.map((p) => ({ label: p.label, count: p.count }))} emptyLabel="No searches for this period" />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Top searches</h2>
          <p className="mb-3 text-[11px] text-muted">What people are typing — a strong repeated term you don&apos;t cover yet is real demand.</p>
          {topTerms.length === 0 ? (
            <p className="text-xs text-muted">No searches for this period.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {topTerms.map((t) => (
                <li key={t.query} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-xs text-foreground">{t.query}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(t.count / maxTermCount) * 100}%` }} />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-xs text-muted">{t.count}</span>
                  <span className="w-14 shrink-0 truncate text-right text-[9px] uppercase tracking-wide text-accent">
                    {INTENT_LABEL[classifySearchIntent(t.query, catalogs)]}
                  </span>
                  <span className="w-16 shrink-0 truncate text-right text-[9px] uppercase tracking-wide text-muted">{CONTEXT_LABEL[t.context]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-sm border border-negative/30 bg-surface p-4">
          <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">What users are looking for but we don&apos;t have</h2>
          <p className="mb-3 text-[11px] text-muted">
            Zero-result searches — a direct signal for which projects to add, which localities to cover, and where to expand next.
          </p>
          {zeroResult.length === 0 ? (
            <p className="text-xs text-muted">No zero-result searches for this period.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {zeroResult.map((t) => (
                <li key={t.query} className="flex items-center justify-between text-xs">
                  <span className="truncate text-foreground">{t.query}</span>
                  <span className="shrink-0 font-mono text-negative">{t.count}×</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Recent searches</h2>
        {recent.length === 0 ? (
          <p className="text-xs text-muted">No searches recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-border">
            <table className="w-full min-w-[560px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Query</th>
                  <th className="px-3 py-2 font-medium">Context</th>
                  <th className="px-3 py-2 font-medium text-right">Results</th>
                  <th className="px-3 py-2 font-medium">Signed in</th>
                  <th className="px-3 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                    <td className="px-3 py-2 font-mono text-foreground">{r.query}</td>
                    <td className="px-3 py-2 text-muted">{CONTEXT_LABEL[r.context]}</td>
                    <td className={`px-3 py-2 text-right font-mono ${r.resultCount === 0 ? "text-negative" : "text-muted"}`}>{r.resultCount ?? "—"}</td>
                    <td className="px-3 py-2 text-muted">{r.isSignedIn ? "Yes" : "No"}</td>
                    <td className="px-3 py-2 text-muted">{formatDateTime(r.createdAt)}</td>
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
