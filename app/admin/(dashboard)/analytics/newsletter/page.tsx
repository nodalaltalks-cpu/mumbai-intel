import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getLatestSubscribers, getNewsletterSummary, getSubscriptionTrend } from "@/lib/analytics/newsletter-queries";
import { formatDate } from "@/lib/format";
import { ANALYTICS_PERIOD_COOKIE, computeChange, resolveAnalyticsPeriodFromRequest } from "@/lib/analytics/period";
import BarChart from "@/app/admin/components/charts/BarChart";
import AnalyticsPeriodFilter from "@/app/admin/components/AnalyticsPeriodFilter";
import AnalyticsStatCard from "@/app/admin/components/AnalyticsStatCard";

export const metadata: Metadata = { title: "Newsletter Analytics — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function NewsletterAnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const period = resolveAnalyticsPeriodFromRequest(params, cookieStore.get(ANALYTICS_PERIOD_COOKIE)?.value);

  const [summary, trend, latest] = await Promise.all([getNewsletterSummary(period), getSubscriptionTrend(period), getLatestSubscribers(10)]);
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
        <AnalyticsPeriodFilter current={period.key} currentFrom={params.from} currentTo={params.to} />
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
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Latest Subscribers</h2>
        {latest.length === 0 ? (
          <p className="text-xs text-muted">No subscribers yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {latest.map((s) => (
              <li key={s.id} className="flex items-center justify-between border-t border-border pt-2 first:border-t-0 first:pt-0">
                <span className="text-xs text-foreground">{s.email}</span>
                <span className="text-[10px] text-muted">
                  {s.source ?? "footer"} · {formatDate(s.subscribedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
