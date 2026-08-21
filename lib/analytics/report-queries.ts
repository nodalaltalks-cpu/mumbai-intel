import "server-only";
import { prisma } from "@/lib/prisma";
import type { ReportStatus } from "@prisma/client";
import type { AnalyticsPeriod } from "./period";

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

/**
 * Resolution rate / rejection rate / avg time-to-resolution -- computed from
 * AuditLog rows the existing ReportStatusChanged subscriber already writes
 * on every transition, no new column.
 *
 * avgResolutionHours specifically measures handling time -- first admin
 * action (report.accepted, or report.under_review if that step was used
 * instead) to report.resolved -- NOT Report.createdAt to resolved. A report
 * can sit unopened for hours before anyone looks at it; counting that wait
 * as "resolution time" overstates how long the actual work took. Every
 * report reaching RESOLVED in this workflow passes through ACCEPTED first
 * (see ReportQueueList's "Mark resolved" gating), so an accepted/under_review
 * row is expected to exist; reports without one are excluded rather than
 * guessed at.
 */
export async function getReportResolutionStats(): Promise<ReportResolutionStats> {
  const [total, resolvedCount, rejectedCount, openCount, resolvedReports] = await Promise.all([
    prisma.report.count(),
    prisma.report.count({ where: { status: "RESOLVED" } }),
    prisma.report.count({ where: { status: "REJECTED" } }),
    prisma.report.count({ where: { status: { in: ["NEW", "UNDER_REVIEW", "ACCEPTED"] } } }),
    prisma.report.findMany({ where: { status: "RESOLVED" }, select: { id: true } }),
  ]);

  let avgResolutionHours: number | null = null;
  if (resolvedReports.length > 0) {
    const resolvedIds = resolvedReports.map((r) => r.id);
    const logs = await prisma.auditLog.findMany({
      where: { entityType: "Report", entityId: { in: resolvedIds }, action: { in: ["report.accepted", "report.under_review", "report.resolved"] } },
      select: { entityId: true, action: true, at: true },
      orderBy: { at: "asc" },
    });

    const startById = new Map<string, Date>(); // earliest accepted/under_review per report
    const resolvedAtById = new Map<string, Date>(); // latest resolved per report
    for (const log of logs) {
      if (log.action === "report.resolved") {
        resolvedAtById.set(log.entityId, log.at);
      } else if (!startById.has(log.entityId)) {
        startById.set(log.entityId, log.at);
      }
    }

    const hoursList = resolvedIds
      .map((id) => {
        const start = startById.get(id);
        const resolvedAt = resolvedAtById.get(id);
        return start && resolvedAt ? (resolvedAt.getTime() - start.getTime()) / (1000 * 60 * 60) : null;
      })
      .filter((hours): hours is number => hours !== null && hours >= 0);
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

export interface ReportPeriodStats {
  submittedInPeriod: number;
  previousSubmittedInPeriod: number;
  /** Reports that reached RESOLVED with their report.resolved AuditLog timestamp inside the period -- an operational "how much did we clear this period" figure, independent of when those reports were originally submitted. */
  resolvedInPeriod: number;
}

/**
 * Section 34's "Reports submitted" reflecting the selected Day/Week/Month/...
 * filter, additive alongside getReportResolutionStats()'s existing all-time
 * totals (Section 12 explicitly requires the existing all-time Total/Open/
 * Resolution Rate/Avg Resolution Time to keep working exactly as before —
 * this is a new, separate period-scoped figure, not a replacement).
 */
export async function getReportPeriodStats(period: AnalyticsPeriod): Promise<ReportPeriodStats> {
  const [submittedInPeriod, previousSubmittedInPeriod, resolvedLogs] = await Promise.all([
    prisma.report.count({ where: { createdAt: { gte: period.since, lt: period.until } } }),
    prisma.report.count({ where: { createdAt: { gte: period.previousSince, lt: period.previousUntil } } }),
    prisma.auditLog.count({ where: { entityType: "Report", action: "report.resolved", at: { gte: period.since, lt: period.until } } }),
  ]);
  return { submittedInPeriod, previousSubmittedInPeriod, resolvedInPeriod: resolvedLogs };
}
