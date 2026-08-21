import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  getEventTrend,
  getEventTypeCounts,
  getResearchActivitySummary,
  getTopViewedBuilders,
  getTopViewedLocalities,
  getTopViewedProjects,
  type TopViewedEntity,
} from "@/lib/analytics/research-queries";
import { getResearchFunnel } from "@/lib/analytics/research-funnel-queries";
import { ANALYTICS_PERIOD_COOKIE, computeChange, resolveAnalyticsPeriodFromRequest } from "@/lib/analytics/period";
import BarChart from "@/app/admin/components/charts/BarChart";
import AnalyticsPeriodFilter from "@/app/admin/components/AnalyticsPeriodFilter";
import AnalyticsStatCard from "@/app/admin/components/AnalyticsStatCard";

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
  LOCKED_FEATURE_CLICKED: "Locked Feature Clicked",
  SIGNUP_COMPLETED: "Signup Completed",
  LOGIN_COMPLETED: "Login Completed",
  TRANSACTION_VIEWED: "Transaction Viewed",
  MARKET_DATA_VIEWED: "Market Data Viewed",
  INSIGHTS_VIEWED: "Insights Viewed",
  REPORT_VIEWED: "Report Viewed",
  TRANSACTION_LIST_VIEWED: "Transaction List Viewed",
  TRANSACTION_SEARCHED: "Transaction Searched",
  TRANSACTION_FILTER_APPLIED: "Transaction Filter Applied",
  LANDING_PAGE_VIEWED: "Landing Page Viewed",
  PROJECT_CARD_CLICKED: "Project Card Clicked",
  NOTIFICATION_OPENED: "Notification Opened",
  EMAIL_SENT: "Email Sent",
  WHATSAPP_SHARE_CLICKED: "WhatsApp Share Clicked",
  REFERRAL_SHARE_INITIATED: "Referral Share Initiated",
  REFERRAL_LINK_CLICKED: "Referral Link Clicked",
};

function TopViewedList({ title, items }: { title: string; items: TopViewedEntity[] }) {
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

export default async function ResearchAnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const period = resolveAnalyticsPeriodFromRequest(params, cookieStore.get(ANALYTICS_PERIOD_COOKIE)?.value);

  const [summary, trend, eventCounts, topProjects, topBuilders, topLocalities, funnel] = await Promise.all([
    getResearchActivitySummary(period),
    getEventTrend(period),
    getEventTypeCounts(period),
    getTopViewedProjects(period, 10),
    getTopViewedBuilders(period, 10),
    getTopViewedLocalities(period, 10),
    getResearchFunnel(period),
  ]);

  const maxEventCount = Math.max(...eventCounts.map((e) => e.count), 1);
  const funnelStart = funnel.stages[0]?.userCount ?? 0;
  const eventsChange = computeChange(summary.totalEvents, summary.previousTotalEvents);
  const searchesChange = computeChange(summary.searchesPerformed, summary.previousSearchesPerformed);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Research Intent Analytics</h1>
          <p className="text-xs text-muted">
            Site-wide behavioral signal — every row is one ResearchEvent, no personal information collected —{" "}
            <Link href="/admin/analytics" className="text-accent hover:underline">
              Analytics
            </Link>
          </p>
        </div>
        <AnalyticsPeriodFilter current={period.key} currentFrom={params.from} currentTo={params.to} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <AnalyticsStatCard label="Total Events" value={summary.totalEvents} previousValue={summary.previousTotalEvents} change={eventsChange} />
        <AnalyticsStatCard label="Searches" value={summary.searchesPerformed} previousValue={summary.previousSearchesPerformed} change={searchesChange} />
        <AnalyticsStatCard label="Filters Used" value={summary.filtersUsed} />
        <AnalyticsStatCard label="Compare Used" value={summary.compareUsed} />
        <AnalyticsStatCard label="Wishlist Added" value={summary.wishlistAdded} />
        <AnalyticsStatCard label="Project Card Clicks" value={summary.projectCardClicks} />
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="font-mono text-sm font-semibold text-foreground">Research funnel — signed-in users, {period.label}</h2>
        <p className="mb-3 text-[11px] text-muted">
          Distinct signed-in users reaching each stage independently (not strict path order) — anonymous/guest
          research isn&apos;t included here since it can&apos;t be attributed to one identity across stages.
        </p>
        {funnelStart === 0 ? (
          <p className="text-xs text-muted">No data for this period.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {funnel.stages.map((stage, i) => {
              const prev = i > 0 ? funnel.stages[i - 1].userCount : null;
              const ofStart = funnelStart > 0 ? Math.round((stage.userCount / funnelStart) * 100) : 0;
              const ofPrev = prev !== null && prev > 0 ? Math.round((stage.userCount / prev) * 100) : null;
              return (
                <li key={stage.key} className="flex items-center gap-2">
                  <span className="w-56 shrink-0 truncate text-xs text-foreground">{stage.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${ofStart}%` }} />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-xs text-muted">{stage.userCount}</span>
                  <span className="w-24 shrink-0 text-right font-mono text-[10px] text-muted">
                    {ofStart}% of start{ofPrev !== null ? ` · ${ofPrev}% of prev` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Event volume — {period.label}</h2>
        <BarChart data={trend.map((p) => ({ label: p.label, count: p.count }))} emptyLabel="No data for this period" />
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Events by type — {period.label}</h2>
        {eventCounts.length === 0 ? (
          <p className="text-xs text-muted">No data for this period.</p>
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
        Continue Research Clicked: {summary.continueResearchClicks} in {period.label.toLowerCase()}. Newsletter Viewed is not currently
        instrumented (the footer newsletter module renders on every page — logging a view there would just count page
        loads, not genuine intent — so it&apos;s intentionally left out; Subscribed/Unsubscribed are tracked above).
      </p>
    </div>
  );
}
