import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { requireAdminSession } from "@/lib/auth/guard";
import { getLocalitiesForSelect } from "@/lib/admin-queries";
import { getEmailCampaigns, getEmailPeriodStats } from "@/lib/analytics/email-queries";
import { formatDateTime } from "@/lib/format";
import { ANALYTICS_PERIOD_COOKIE, computeChange, resolveAnalyticsPeriodFromRequest } from "@/lib/analytics/period";
import AnalyticsPeriodFilter from "@/app/admin/components/AnalyticsPeriodFilter";
import AnalyticsStatCard from "@/app/admin/components/AnalyticsStatCard";
import EmailComposer from "@/app/admin/components/EmailComposer";

export const metadata: Metadata = { title: "Email — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  NEWSLETTER: "Newsletter",
  RESEARCH_UPDATE: "Research / Market Update",
  MARKET_REPORT: "Transaction / Market Report",
  PRODUCT_COMMUNICATION: "Product Communication",
  REPORT_COMMUNICATION: "Report Communication",
};

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "border-border bg-surface-raised text-muted",
  QUEUED: "border-border bg-surface-raised text-muted",
  SENDING: "border-accent/40 bg-accent/10 text-accent",
  SENT: "border-positive/40 bg-positive/10 text-positive",
  FAILED: "border-negative/40 bg-negative/10 text-negative",
};

export default async function AdminEmailPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  await requireAdminSession();
  const params = await searchParams;
  const cookieStore = await cookies();
  const period = resolveAnalyticsPeriodFromRequest(params, cookieStore.get(ANALYTICS_PERIOD_COOKIE)?.value);

  const [localities, campaigns, periodStats] = await Promise.all([
    getLocalitiesForSelect(),
    getEmailCampaigns(20, period),
    getEmailPeriodStats(period),
  ]);
  const campaignsChange = computeChange(periodStats.campaignsInPeriod, periodStats.previousCampaignsInPeriod);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Email</h1>
        <p className="text-xs text-muted">
          Lightweight in-house campaign send — no third-party newsletter/CRM tool. Every send is tracked per recipient below.
        </p>
      </div>

      <EmailComposer localities={localities} />

      <div className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs uppercase tracking-wide text-accent">
            {period.label} <span className="text-muted">· {period.dateRangeLabel} IST</span>
          </p>
          <AnalyticsPeriodFilter current={period.key} currentFrom={params.from} currentTo={params.to} />
        </div>
        <div className="flex flex-wrap gap-3">
          <AnalyticsStatCard label="Campaigns (period)" value={periodStats.campaignsInPeriod} previousValue={periodStats.previousCampaignsInPeriod} change={campaignsChange} />
          <AnalyticsStatCard label="Accepted by provider (period)" value={periodStats.recipientsAcceptedInPeriod} />
          <AnalyticsStatCard label="Failed (period)" value={periodStats.recipientsFailedInPeriod} />
        </div>
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Past campaigns — {period.label}</h2>
        {campaigns.length === 0 ? (
          <p className="text-xs text-muted">No data for this period.</p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-border">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Subject</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">Recipients</th>
                  <th className="px-3 py-2 font-medium text-right">Accepted / Failed</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Sent</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                    <td className="px-3 py-2 font-mono text-foreground">
                      <Link href={`/admin/email/${c.id}`} className="hover:text-accent hover:underline">
                        {c.subject}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted">{TYPE_LABEL[c.type] ?? c.type}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_CLASS[c.status]}`}>{c.status}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">{c.recipientCount}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">
                      {c.successCount} / {c.failureCount}
                    </td>
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
