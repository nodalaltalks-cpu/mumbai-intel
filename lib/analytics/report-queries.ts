import "server-only";
import { prisma } from "@/lib/prisma";
import type { ReportStatus } from "@prisma/client";

export interface ReportRow {
  id: string;
  entityType: string;
  entityId: string | null;
  entityName: string;
  entityUrl: string;
  category: string | null;
  issue: string;
  suggestedValue: string | null;
  reporterEmail: string | null;
  status: ReportStatus;
  createdAt: Date;
  reviewedAt: Date | null;
}

export async function getReportsQueue(status?: ReportStatus): Promise<ReportRow[]> {
  return prisma.report.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function getReportStatusCounts(): Promise<Record<string, number>> {
  const groups = await prisma.report.groupBy({ by: ["status"], _count: { id: true } });
  return Object.fromEntries(groups.map((g) => [g.status, g._count.id]));
}

export interface ReportAggregateRow {
  entityType: string;
  entityId: string | null;
  entityName: string;
  category: string | null;
  count: number;
  latestAt: Date;
}

/** "Lodha Park · Pricing · 12 reports" — same (entityId, category) grouping key surfaced on the queue page ahead of the flat list, so repeated complaints about the same field are obvious at a glance. */
export async function getReportAggregates(): Promise<ReportAggregateRow[]> {
  const reports = await prisma.report.findMany({
    where: { status: { in: ["NEW", "UNDER_REVIEW"] } },
    select: { entityType: true, entityId: true, entityName: true, category: true, createdAt: true },
  });

  const groups = new Map<string, ReportAggregateRow>();
  for (const r of reports) {
    const key = `${r.entityType}:${r.entityId ?? "-"}:${r.category ?? "-"}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (r.createdAt > existing.latestAt) existing.latestAt = r.createdAt;
    } else {
      groups.set(key, { entityType: r.entityType, entityId: r.entityId, entityName: r.entityName, category: r.category, count: 1, latestAt: r.createdAt });
    }
  }
  return Array.from(groups.values())
    .filter((g) => g.count > 1)
    .sort((a, b) => b.count - a.count);
}

export interface ReportResolutionStats {
  total: number;
  resolvedCount: number;
  rejectedCount: number;
  openCount: number;
  resolutionRatePercent: number | null;
  rejectionRatePercent: number | null;
  avgResolutionHours: number | null;
}

/** Resolution rate / rejection rate / avg time-to-resolution — computed from data that already exists (Report.createdAt + the "report.resolved" AuditLog row each resolution already writes via the existing ReportStatusChanged subscriber), no new column. */
export async function getReportResolutionStats(): Promise<ReportResolutionStats> {
  const [total, resolvedCount, rejectedCount, openCount, resolvedReports] = await Promise.all([
    prisma.report.count(),
    prisma.report.count({ where: { status: "RESOLVED" } }),
    prisma.report.count({ where: { status: "REJECTED" } }),
    prisma.report.count({ where: { status: { in: ["NEW", "UNDER_REVIEW", "ACCEPTED"] } } }),
    prisma.report.findMany({ where: { status: "RESOLVED" }, select: { id: true, createdAt: true } }),
  ]);

  let avgResolutionHours: number | null = null;
  if (resolvedReports.length > 0) {
    const resolvedIds = resolvedReports.map((r) => r.id);
    const resolvedLogs = await prisma.auditLog.findMany({
      where: { entityType: "Report", entityId: { in: resolvedIds }, action: "report.resolved" },
      select: { entityId: true, at: true },
      orderBy: { at: "desc" },
    });
    // A report can only ever be resolved once in practice (no re-open flow exists), but if it
    // somehow has more than one "report.resolved" row, the most recent one is authoritative --
    // orderBy above + this Map keeps only the first (latest) per id.
    const resolvedAtById = new Map<string, Date>();
    for (const log of resolvedLogs) {
      if (!resolvedAtById.has(log.entityId)) resolvedAtById.set(log.entityId, log.at);
    }

    const hoursList = resolvedReports
      .map((r) => {
        const resolvedAt = resolvedAtById.get(r.id);
        return resolvedAt ? (resolvedAt.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60) : null;
      })
      .filter((hours): hours is number => hours !== null);
    if (hoursList.length > 0) {
      avgResolutionHours = Math.round((hoursList.reduce((a, b) => a + b, 0) / hoursList.length) * 10) / 10;
    }
  }

  return {
    total,
    resolvedCount,
    rejectedCount,
    openCount,
    resolutionRatePercent: total > 0 ? Math.round((resolvedCount / total) * 100) : null,
    rejectionRatePercent: total > 0 ? Math.round((rejectedCount / total) * 100) : null,
    avgResolutionHours,
  };
}
