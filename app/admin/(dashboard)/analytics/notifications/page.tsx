import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { requireSession } from "@/lib/auth/guard";
import { getNotificationAnalyticsOverview } from "@/lib/analytics/notification-queries";
import { ANALYTICS_PERIOD_COOKIE, resolveAnalyticsPeriodFromRequest } from "@/lib/analytics/period";
import AnalyticsPeriodFilter from "@/app/admin/components/AnalyticsPeriodFilter";
import AnalyticsStatCard from "@/app/admin/components/AnalyticsStatCard";

export const metadata: Metadata = { title: "Notification Analytics — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  NEW_LAUNCH: "New Launch",
  PRICE_OFFER: "Price / Offer",
  TRENDING_LOCALITY: "Trending Locality",
  NEW_REPORT: "New Report",
  MARKET_INSIGHT: "Market Insight",
  TRANSACTION_DATA: "Transaction Data",
  SAVED_SEARCH_ANNOUNCEMENT: "Saved Search",
  PRODUCT_UPDATE: "Product Update",
  GENERAL_UPDATE: "General Update",
};

export default async function NotificationAnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  await requireSession();
  const params = await searchParams;
  const cookieStore = await cookies();
  const period = resolveAnalyticsPeriodFromRequest(params, cookieStore.get(ANALYTICS_PERIOD_COOKIE)?.value);

  const overview = await getNotificationAnalyticsOverview(period);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">
            Notification Analytics <Link href="/admin/notifications" className="text-xs font-normal text-muted hover:text-accent">← Notifications</Link>
          </h1>
          <p className="text-xs text-muted">Real performance across every founder-sent notification campaign — read/click state read directly off each Notification row.</p>
        </div>
        <AnalyticsPeriodFilter current={period.key} currentFrom={params.from} currentTo={params.to} label={period.label} dateRangeLabel={period.dateRangeLabel} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <AnalyticsStatCard label="Campaigns (period)" value={overview.campaignsInPeriod} />
        <AnalyticsStatCard label="Sent" value={overview.sent} />
        <AnalyticsStatCard label="Read" value={overview.read} />
        <AnalyticsStatCard label="Clicked" value={overview.clicked} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Read rate</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-positive">{overview.readRate !== null ? `${overview.readRate}%` : "--"}</p>
        </div>
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Click rate</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-accent">{overview.clickRate !== null ? `${overview.clickRate}%` : "--"}</p>
        </div>
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">By category</h2>
        <p className="mb-3 text-[11px] text-muted">Which notification categories users actually engage with — a high click rate here is a useful category to send more of; a low one is worth reconsidering.</p>
        {overview.byCategory.length === 0 ? (
          <p className="text-xs text-muted">No notification campaigns for this period.</p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-border">
            <table className="w-full min-w-[480px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium text-right">Sent</th>
                  <th className="px-3 py-2 font-medium text-right">Read</th>
                  <th className="px-3 py-2 font-medium text-right">Clicked</th>
                </tr>
              </thead>
              <tbody>
                {overview.byCategory.map((row) => (
                  <tr key={row.category} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 text-foreground">{CATEGORY_LABEL[row.category] ?? row.category}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{row.sent}</td>
                    <td className="px-3 py-2 text-right font-mono text-positive">{row.read}</td>
                    <td className="px-3 py-2 text-right font-mono text-accent">{row.clicked}</td>
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
