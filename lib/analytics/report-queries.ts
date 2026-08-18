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
