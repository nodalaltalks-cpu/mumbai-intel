import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/guard";
import { getReportAggregates, getReportResolutionStats, getReportsQueue, getReportStatusCounts } from "@/lib/analytics/report-queries";
import ReportQueueList from "@/app/admin/components/ReportQueueList";
import { formatDate } from "@/lib/format";
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

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const activeStatus = (STATUS_TABS.find((t) => t.key === params.status)?.key ?? "ALL") as ReportStatus | "ALL";

  const [reports, counts, aggregates, resolutionStats] = await Promise.all([
    getReportsQueue(activeStatus === "ALL" ? undefined : activeStatus),
    getReportStatusCounts(),
    getReportAggregates(),
    getReportResolutionStats(),
  ]);

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
          ["Total Reports", resolutionStats.total],
          ["Open", resolutionStats.openCount],
          ["Resolution Rate", resolutionStats.resolutionRatePercent !== null ? `${resolutionStats.resolutionRatePercent}%` : "--"],
          ["Avg. Resolution Time (since accepted)", resolutionStats.avgResolutionHours !== null ? `${resolutionStats.avgResolutionHours}h` : "--"],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => (
          <a
            key={tab.key}
            href={tab.key === "ALL" ? "/admin/reports" : `/admin/reports?status=${tab.key}`}
            className={`rounded-sm border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide ${
              activeStatus === tab.key ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {tab.label} {tab.key !== "ALL" ? `(${counts[tab.key] ?? 0})` : ""}
          </a>
        ))}
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
