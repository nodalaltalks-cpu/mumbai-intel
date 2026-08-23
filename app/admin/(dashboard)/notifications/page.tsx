import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { requireAdminSession } from "@/lib/auth/guard";
import { getLocalitiesForSelect } from "@/lib/admin-queries";
import { getNotificationCampaigns } from "@/lib/analytics/notification-queries";
import { ANALYTICS_PERIOD_COOKIE, resolveAnalyticsPeriodFromRequest } from "@/lib/analytics/period";
import { formatDateTime } from "@/lib/format";
import { formatNotificationCategory } from "@/lib/notification-category-label";
import AnalyticsPeriodFilter from "@/app/admin/components/AnalyticsPeriodFilter";
import NotificationComposer from "@/app/admin/components/NotificationComposer";

export const metadata: Metadata = { title: "Notifications — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "border-border bg-surface-raised text-muted",
  QUEUED: "border-border bg-surface-raised text-muted",
  SENDING: "border-accent/40 bg-accent/10 text-accent",
  SENT: "border-positive/40 bg-positive/10 text-positive",
  FAILED: "border-negative/40 bg-negative/10 text-negative",
};

export default async function AdminNotificationsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  await requireAdminSession();
  const params = await searchParams;
  const cookieStore = await cookies();
  const period = resolveAnalyticsPeriodFromRequest(params, cookieStore.get(ANALYTICS_PERIOD_COOKIE)?.value);

  const [localities, campaigns] = await Promise.all([getLocalitiesForSelect(), getNotificationCampaigns(50)]);
  const campaignsInPeriod = campaigns.filter((c) => c.createdAt >= period.since && c.createdAt < period.until);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Notifications</h1>
        <p className="text-xs text-muted">
          In-platform notifications sent directly to users — not email. Every send is a real notification, tracked per recipient below.
        </p>
      </div>

      <NotificationComposer localities={localities} />

      <section className="rounded-sm border border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-mono text-sm font-semibold text-foreground">Campaign history</h2>
          <AnalyticsPeriodFilter current={period.key} currentFrom={params.from} currentTo={params.to} label={period.label} dateRangeLabel={period.dateRangeLabel} />
        </div>
        {campaignsInPeriod.length === 0 ? (
          <p className="text-xs text-muted">No notification campaigns for this period.</p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-border">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">Recipients</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Sent</th>
                </tr>
              </thead>
              <tbody>
                {campaignsInPeriod.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                    <td className="px-3 py-2 font-mono text-foreground">
                      <Link href={`/admin/notifications/campaigns/${c.id}`} className="hover:text-accent hover:underline">
                        {c.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted">{formatNotificationCategory(c.category, c.customCategory)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_CLASS[c.status] ?? ""}`}>{c.status}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">{c.recipientCount}</td>
                    <td className="px-3 py-2 text-muted">{formatDateTime(c.createdAt)}</td>
                    <td className="px-3 py-2 text-muted">{c.sentAt ? formatDateTime(c.sentAt) : "--"}</td>
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
