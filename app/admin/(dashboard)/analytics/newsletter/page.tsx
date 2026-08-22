import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getAllSubscribers, getNewsletterSummary, getSourceBreakdown, getSubscriptionTrend } from "@/lib/analytics/newsletter-queries";
import { formatDate, formatDateTime } from "@/lib/format";
import { ANALYTICS_PERIOD_COOKIE, computeChange, resolveAnalyticsPeriodFromRequest } from "@/lib/analytics/period";
import BarChart from "@/app/admin/components/charts/BarChart";
import AnalyticsPeriodFilter from "@/app/admin/components/AnalyticsPeriodFilter";
import AnalyticsStatCard from "@/app/admin/components/AnalyticsStatCard";

export const metadata: Metadata = { title: "Newsletter Analytics — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  footer: "Footer",
  project_page: "Project Page",
  market_data: "Market Data",
  dashboard: "Dashboard",
  referral: "Referral",
  other: "Other",
};

const STATUS_CLASS: Record<string, string> = {
  SUBSCRIBED: "border-positive/40 bg-positive/10 text-positive",
  UNSUBSCRIBED: "border-border bg-surface-raised text-muted",
};

export default async function NewsletterAnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const period = resolveAnalyticsPeriodFromRequest(params, cookieStore.get(ANALYTICS_PERIOD_COOKIE)?.value);

  const [summary, trend, subscribers, sourceBreakdown] = await Promise.all([
    getNewsletterSummary(period),
    getSubscriptionTrend(period),
    getAllSubscribers(200),
    getSourceBreakdown(),
  ]);
  const change = computeChange(summary.newSubscribersInPeriod, summary.previousNewSubscribersInPeriod);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Newsletter Analytics</h1>
          <p className="text-xs text-muted">
            &ldquo;Stay Ahead of the Market&rdquo; — weekly research signup, live from NewsletterSubscriber —{" "}
            <Link href="/admin/analytics" className="text-accent hover:underline">
              Analytics
            </Link>
          </p>
        </div>
        <AnalyticsPeriodFilter current={period.key} currentFrom={params.from} currentTo={params.to} label={period.label} dateRangeLabel={period.dateRangeLabel} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <AnalyticsStatCard label="New Subscribers (period)" value={summary.newSubscribersInPeriod} previousValue={summary.previousNewSubscribersInPeriod} change={change} />
        <AnalyticsStatCard label="Total Subscribers (all time)" value={summary.totalSubscribers} />
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Subscriptions — {period.label}</h2>
        <BarChart data={trend.map((p) => ({ label: p.label, count: p.count }))} emptyLabel="No data for this period" />
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Subscribers by source</h2>
        <p className="mb-3 text-[11px] text-muted">Which parts of NDT generate subscribers — all-time, subscribed only.</p>
        {sourceBreakdown.length === 0 ? (
          <p className="text-xs text-muted">No subscribers yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sourceBreakdown.map((s) => (
              <li key={s.source} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-xs text-foreground">{SOURCE_LABEL[s.source] ?? s.source}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(s.count / (sourceBreakdown[0]?.count || 1)) * 100}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-xs text-muted">{s.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">All Subscribers</h2>
        <p className="mb-3 text-[11px] text-muted">
          Every newsletter subscription, most recent first — up to 200 rows. &ldquo;Account subscriptions&rdquo; counts how many distinct emails the
          same NDT account has subscribed with.
        </p>
        {subscribers.length === 0 ? (
          <p className="text-xs text-muted">No subscribers yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-border">
            <table className="w-full min-w-[860px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Subscribed</th>
                  <th className="px-3 py-2 font-medium">Last Updated</th>
                  <th className="px-3 py-2 font-medium text-right">Account Subscriptions</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                    <td className="px-3 py-2 font-mono text-foreground">{s.email}</td>
                    <td className="px-3 py-2 text-muted">{s.accountName ?? s.accountEmail ?? "— (no account)"}</td>
                    <td className="px-3 py-2 text-muted">{SOURCE_LABEL[s.source ?? "other"] ?? s.source}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_CLASS[s.status] ?? ""}`}>{s.status}</span>
                    </td>
                    <td className="px-3 py-2 text-muted">{formatDate(s.subscribedAt)}</td>
                    <td className="px-3 py-2 text-muted">{formatDateTime(s.updatedAt)}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{s.subscriptionsForAccount || "--"}</td>
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
