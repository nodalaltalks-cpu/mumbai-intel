import Link from "next/link";
import type { Metadata } from "next";
import { getLatestSubscribers, getNewsletterSummary, getSubscriptionTrend } from "@/lib/analytics/newsletter-queries";
import { formatDate } from "@/lib/format";
import BarChart from "@/app/admin/components/charts/BarChart";

export const metadata: Metadata = { title: "Newsletter Analytics — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function NewsletterAnalyticsPage() {
  const [summary, trend, latest] = await Promise.all([
    getNewsletterSummary(),
    getSubscriptionTrend(30),
    getLatestSubscribers(10),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Newsletter Analytics</h1>
          <p className="text-xs text-muted">
            &ldquo;Stay Ahead of the Market&rdquo; — weekly research signup, live from NewsletterSubscriber —{" "}
            <Link href="/admin/analytics" className="text-accent hover:underline">
              Analytics
            </Link>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Total Subscribers", summary.totalSubscribers],
          ["Today", summary.subscribersToday],
          ["Weekly Growth", summary.weeklyGrowth],
          ["Monthly Growth", summary.monthlyGrowth],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Subscription trend — last 30 days</h2>
        <BarChart data={trend.map((p) => ({ label: p.date.slice(5), count: p.count }))} emptyLabel="No subscriptions recorded in this window yet" />
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
