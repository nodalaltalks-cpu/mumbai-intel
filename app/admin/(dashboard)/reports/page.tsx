import type { Metadata } from "next";
import { cookies } from "next/headers";
import { requireSession } from "@/lib/auth/guard";
import { getReportAggregates, getReportPeriodStats, getReportResolutionStats, getReportsQueue, getReportStatusCounts } from "@/lib/analytics/report-queries";
import ReportQueueList from "@/app/admin/components/ReportQueueList";
import { formatDate } from "@/lib/format";
import { ANALYTICS_PERIOD_COOKIE, computeChange, resolveAnalyticsPeriodFromRequest } from "@/lib/analytics/period";
import AnalyticsPeriodFilter from "@/app/admin/components/AnalyticsPeriodFilter";
import AnalyticsStatCard from "@/app/admin/components/AnalyticsStatCard";
import type { ReportStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Reports — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const STATUS_TABS: { key: ReportStatus | "ALL"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "NEW", label: "New" },
  { key: "UNDER_REVIEW", label: "Under Review" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "REJECTED", label: "Rejected" },
  { key: "RESOLVED", label: "Resolved" },
];

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; period?: string; from?: string; to?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const activeStatus = (STATUS_TABS.find((t) => t.key === params.status)?.key ?? "ALL") as ReportStatus | "ALL";
  const cookieStore = await cookies();
  const period = resolveAnalyticsPeriodFromRequest(params, cookieStore.get(ANALYTICS_PERIOD_COOKIE)?.value);

  const [reports, counts, aggregates, resolutionStats, periodStats] = await Promise.all([
    getReportsQueue(activeStatus === "ALL" ? undefined : activeStatus),
    getReportStatusCounts(),
    getReportAggregates(),
    getReportResolutionStats(),
    getReportPeriodStats(period),
  ]);
  const submittedChange = computeChange(periodStats.submittedInPeriod, periodStats.previousSubmittedInPeriod);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Report Inaccurate Information</h1>
        <p className="text-xs text-muted">
          Visitor-submitted &quot;this looks wrong&quot; reports — a real data-quality signal, not just an inbox message.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Total Reports (all time)", resolutionStats.total],
          ["Open (current)", resolutionStats.openCount],
          ["Resolution Rate (all time)", resolutionStats.resolutionRatePercent !== null ? `${resolutionStats.resolutionRatePercent}%` : "--"],
          ["Avg. Resolution Time (since accepted)", resolutionStats.avgResolutionHours !== null ? `${resolutionStats.avgResolutionHours}h` : "--"],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border bg-surface p-4">
        <div className="flex flex-wrap gap-3">
          <AnalyticsStatCard label="Submitted (period)" value={periodStats.submittedInPeriod} previousValue={periodStats.previousSubmittedInPeriod} change={submittedChange} />
          <AnalyticsStatCard label="Resolved (period)" value={periodStats.resolvedInPeriod} />
        </div>
        <AnalyticsPeriodFilter current={period.key} currentFrom={params.from} currentTo={params.to} label={period.label} dateRangeLabel={period.dateRangeLabel} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => {
          const qs = new URLSearchParams();
          if (tab.key !== "ALL") qs.set("status", tab.key);
          if (params.period) qs.set("period", params.period);
          if (params.from) qs.set("from", params.from);
          if (params.to) qs.set("to", params.to);
          const query = qs.toString();
          return (
            <a
              key={tab.key}
              href={query ? `/admin/reports?${query}` : "/admin/reports"}
              className={`rounded-sm border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide ${
                activeStatus === tab.key ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {tab.label} {tab.key !== "ALL" ? `(${counts[tab.key] ?? 0})` : ""}
            </a>
          );
        })}
      </div>

      {aggregates.length > 0 ? (
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-2 font-mono text-sm font-semibold text-foreground">Repeated issues</h2>
          <p className="mb-3 text-[11px] text-muted">Multiple visitors flagged the same entity + field — likely worth prioritizing.</p>
          <ul className="flex flex-col gap-1.5">
            {aggregates.map((agg) => (
              <li key={`${agg.entityType}:${agg.entityId}:${agg.category}`} className="flex items-center justify-between text-xs">
                <span className="text-foreground">
                  {agg.entityName} <span className="text-muted">— {agg.category ?? "uncategorized"}</span>
                </span>
                <span className="font-mono text-accent">
                  {agg.count} reports · latest {formatDate(agg.latestAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ReportQueueList reports={reports} canDelete={session.role === "ADMIN"} />
    </div>
  );
}
