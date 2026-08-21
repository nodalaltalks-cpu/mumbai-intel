import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  getBrochureAnalyticsSummary,
  getDownloadTrend,
  getDownloadsByDevice,
  getDownloadsBySource,
  getTopDownloadedBuilders,
  getTopDownloadedLocalities,
  getTopDownloadedMicroMarkets,
  getTopDownloadedProjects,
} from "@/lib/analytics/brochure-queries";
import { ANALYTICS_PERIOD_COOKIE, computeChange, resolveAnalyticsPeriodFromRequest } from "@/lib/analytics/period";
import BarChart from "@/app/admin/components/charts/BarChart";
import AnalyticsPeriodFilter from "@/app/admin/components/AnalyticsPeriodFilter";
import AnalyticsStatCard from "@/app/admin/components/AnalyticsStatCard";

export const metadata: Metadata = { title: "Brochure Analytics — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

function BreakdownList({ title, items }: { title: string; items: { label: string; count: number }[] }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <section className="rounded-sm border border-border bg-surface p-4">
      <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">{title}</h2>
      {items.length === 0 ? (
        <p className="text-xs text-muted">No data for this period.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.label} className="flex items-center gap-2">
              <span className="w-24 shrink-0 truncate text-xs text-foreground">{item.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(item.count / max) * 100}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right font-mono text-xs text-muted">{item.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TopList({ title, href, items }: { title: string; href: (id: string, slug: string | null) => string; items: { id: string; name: string; slug: string | null; downloadCount: number }[] }) {
  return (
    <section className="rounded-sm border border-border bg-surface p-4">
      <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">{title}</h2>
      {items.length === 0 ? (
        <p className="text-xs text-muted">No data for this period.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li key={item.id} className="flex items-center justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
              <span className="flex min-w-0 items-center gap-2">
                <span className="font-mono text-[10px] text-muted">{i + 1}</span>
                <Link href={href(item.id, item.slug)} className="truncate text-xs text-foreground hover:text-accent">
                  {item.name}
                </Link>
              </span>
              <span className="shrink-0 font-mono text-xs text-accent">{item.downloadCount}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function BrochureAnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const period = resolveAnalyticsPeriodFromRequest(params, cookieStore.get(ANALYTICS_PERIOD_COOKIE)?.value);

  const [summary, trend, topProjects, topBuilders, topLocalities, topMicroMarkets, byDevice, bySource] = await Promise.all([
    getBrochureAnalyticsSummary(period),
    getDownloadTrend(period),
    getTopDownloadedProjects(period, 10),
    getTopDownloadedBuilders(period, 10),
    getTopDownloadedLocalities(period, 10),
    getTopDownloadedMicroMarkets(period, 10),
    getDownloadsByDevice(period),
    getDownloadsBySource(period, 8),
  ]);

  const downloadsChange = computeChange(summary.downloadsInPeriod, summary.previousDownloadsInPeriod);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Brochure Analytics</h1>
          <p className="text-xs text-muted">
            Every number below is derived from individual download events (never a counter) — see{" "}
            <Link href="/admin/analytics" className="text-accent hover:underline">
              Analytics
            </Link>{" "}
            for transaction/builder/locality intelligence.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AnalyticsPeriodFilter current={period.key} currentFrom={params.from} currentTo={params.to} />
          <a
            href="/api/admin/brochure-analytics/export"
            className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
          >
            Export CSV
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <AnalyticsStatCard label="Downloads (period)" value={summary.downloadsInPeriod} previousValue={summary.previousDownloadsInPeriod} change={downloadsChange} />
        <AnalyticsStatCard label="Total Downloads (all time)" value={summary.totalDownloads} />
        <AnalyticsStatCard label="Today" value={summary.downloadsToday} />
        <AnalyticsStatCard label="Last 7 Days" value={summary.downloadsThisWeek} />
        <AnalyticsStatCard label="Brochure Views (all time)" value={summary.totalViews} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Anonymous</p>
          <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">{summary.anonymousDownloads}</p>
        </div>
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Logged In</p>
          <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">{summary.loggedInDownloads}</p>
        </div>
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Returning Downloaders</p>
          <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">{summary.returningDownloaders}</p>
        </div>
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Downloads — {period.label}</h2>
        <BarChart data={trend.map((p) => ({ label: p.label, count: p.count }))} emptyLabel="No data for this period" />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TopList title="Top Downloaded Projects" href={(_id, slug) => (slug ? `/admin/projects?q=${encodeURIComponent(slug)}` : "/admin/projects")} items={topProjects} />
        <TopList title="Top Downloaded Builders" href={(id) => `/admin/builders/${id}/edit`} items={topBuilders} />
        <TopList title="Top Downloaded Localities" href={(id) => `/admin/localities/${id}/edit`} items={topLocalities} />
        <TopList title="Top Downloaded Micro Markets" href={() => "/admin/localities"} items={topMicroMarkets} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BreakdownList title="Downloads by Device" items={byDevice} />
        <BreakdownList title="Downloads by Source" items={bySource} />
      </div>

      <p className="text-[11px] text-muted">
        Homepage → Search → Project Page → Download → Wishlist → Compare funnel: download-side events are fully
        tracked here. Earlier funnel steps (homepage/search views) and the future Consultation step aren&apos;t
        instrumented yet — this table is built so those can be added as new event rows without a schema change.
      </p>
    </div>
  );
}
