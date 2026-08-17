import Link from "next/link";
import type { Metadata } from "next";
import {
  getEventTrend,
  getEventTypeCounts,
  getResearchActivitySummary,
  getTopViewedBuilders,
  getTopViewedLocalities,
  getTopViewedProjects,
  type TopViewedEntity,
} from "@/lib/analytics/research-queries";
import BarChart from "@/app/admin/components/charts/BarChart";

export const metadata: Metadata = { title: "Research Intent Analytics — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const EVENT_TYPE_LABEL: Record<string, string> = {
  PROJECT_VIEWED: "Project Viewed",
  BUILDER_VIEWED: "Builder Viewed",
  LOCALITY_VIEWED: "Locality Viewed",
  SEARCH_PERFORMED: "Search Performed",
  FILTERS_USED: "Filters Used",
  COMPARE_USED: "Compare Used",
  WISHLIST_ADDED: "Wishlist Added",
  CONTINUE_RESEARCH_CLICKED: "Continue Research Clicked",
  PROFILE_VIEWED: "Profile Viewed",
  PROFILE_UPDATED: "Profile Updated",
  NEWSLETTER_VIEWED: "Newsletter Viewed",
  NEWSLETTER_SUBSCRIBED: "Newsletter Subscribed",
  NEWSLETTER_UNSUBSCRIBED: "Newsletter Unsubscribed",
  TRANSACTION_VIEWED: "Transaction Viewed",
  MARKET_DATA_VIEWED: "Market Data Viewed",
  INSIGHTS_VIEWED: "Insights Viewed",
  REPORT_VIEWED: "Report Viewed",
};

function TopViewedList({ title, items }: { title: string; items: TopViewedEntity[] }) {
  return (
    <section className="rounded-sm border border-border bg-surface p-4">
      <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">{title}</h2>
      {items.length === 0 ? (
        <p className="text-xs text-muted">No views recorded yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li key={item.id} className="flex items-center justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
              <span className="flex min-w-0 items-center gap-2">
                <span className="font-mono text-[10px] text-muted">{i + 1}</span>
                <Link href={item.href} className="truncate text-xs text-foreground hover:text-accent">
                  {item.name}
                </Link>
              </span>
              <span className="shrink-0 font-mono text-xs text-accent">{item.viewCount}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function ResearchAnalyticsPage() {
  const [summary, trend, eventCounts, topProjects, topBuilders, topLocalities] = await Promise.all([
    getResearchActivitySummary(),
    getEventTrend(30),
    getEventTypeCounts(),
    getTopViewedProjects(10),
    getTopViewedBuilders(10),
    getTopViewedLocalities(10),
  ]);

  const maxEventCount = Math.max(...eventCounts.map((e) => e.count), 1);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Research Intent Analytics</h1>
          <p className="text-xs text-muted">
            Site-wide behavioral signal — every row is one ResearchEvent, no personal information collected —{" "}
            <Link href="/admin/analytics" className="text-accent hover:underline">
              Analytics
            </Link>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Total Events", summary.totalEvents],
          ["Today", summary.eventsToday],
          ["Searches", summary.searchesPerformed],
          ["Filters Used", summary.filtersUsed],
          ["Compare Used", summary.compareUsed],
          ["Wishlist Added", summary.wishlistAdded],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Event volume — last 30 days</h2>
        <BarChart data={trend.map((p) => ({ label: p.date.slice(5), count: p.count }))} emptyLabel="No research events recorded in this window yet" />
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Events by type</h2>
        {eventCounts.length === 0 ? (
          <p className="text-xs text-muted">No events recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {eventCounts.map((e) => (
              <li key={e.eventType} className="flex items-center gap-2">
                <span className="w-48 shrink-0 truncate text-xs text-foreground">{EVENT_TYPE_LABEL[e.eventType] ?? e.eventType}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(e.count / maxEventCount) * 100}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-xs text-muted">{e.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <TopViewedList title="Top Viewed Projects" items={topProjects} />
        <TopViewedList title="Top Viewed Builders" items={topBuilders} />
        <TopViewedList title="Top Viewed Localities" items={topLocalities} />
      </div>

      <p className="text-[11px] text-muted">
        Continue Research Clicked: {summary.continueResearchClicks} total. Newsletter Viewed is not currently
        instrumented (the footer newsletter module renders on every page — logging a view there would just count page
        loads, not genuine intent — so it&apos;s intentionally left out; Subscribed/Unsubscribed are tracked above).
      </p>
    </div>
  );
}
