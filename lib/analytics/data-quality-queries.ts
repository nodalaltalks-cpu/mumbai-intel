import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Founder-facing "where is our intelligence weak" reads. Deliberately reuses
 * fields that already exist and are already maintained elsewhere — no new
 * scoring is invented here:
 *  - completionPercent: computed by lib/project-completion.ts on every
 *    create/update/autosave, section-weighted and already explainable.
 *  - confidence/dataSource: the schema's existing provenance tags.
 *  - updatedAt, transactions/documents relations: the schema's existing
 *    freshness and completeness signals.
 * Scoped to isPublished/non-archived/non-deleted projects only — a draft
 * naturally has low completion and no transactions by definition, so
 * including drafts here would just be noise, not a real data-quality signal.
 */

const STALE_AFTER_DAYS = 90;

const LIVE_PROJECT_WHERE = { isPublished: true, isArchived: false, deletedAt: null } as const;

export interface DataQualitySummary {
  totalLiveProjects: number;
  averageCompletionPercent: number;
  staleCount: number;
  staleAfterDays: number;
  noTransactionsCount: number;
  missingDocsCount: number;
  lowConfidenceCount: number;
  duplicateCandidateGroupCount: number;
}

export async function getDataQualitySummary(): Promise<DataQualitySummary> {
  const staleSince = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000);

  const [projects, staleCount, noTransactionsCount, missingDocsCount, lowConfidenceCount, duplicateGroups] = await Promise.all([
    prisma.project.findMany({ where: LIVE_PROJECT_WHERE, select: { completionPercent: true } }),
    prisma.project.count({ where: { ...LIVE_PROJECT_WHERE, updatedAt: { lt: staleSince } } }),
    prisma.project.count({ where: { ...LIVE_PROJECT_WHERE, transactions: { none: {} } } }),
    prisma.project.count({ where: { ...LIVE_PROJECT_WHERE, brochureUrl: null, documents: { none: {} } } }),
    prisma.project.count({ where: { ...LIVE_PROJECT_WHERE, confidence: "LOW" } }),
    prisma.project.groupBy({ by: ["name", "localityId"], where: LIVE_PROJECT_WHERE, _count: { id: true } }),
  ]);

  const totalLiveProjects = projects.length;
  const averageCompletionPercent =
    totalLiveProjects === 0 ? 0 : Math.round(projects.reduce((sum, p) => sum + p.completionPercent, 0) / totalLiveProjects);

  return {
    totalLiveProjects,
    averageCompletionPercent,
    staleCount,
    staleAfterDays: STALE_AFTER_DAYS,
    noTransactionsCount,
    missingDocsCount,
    lowConfidenceCount,
    duplicateCandidateGroupCount: duplicateGroups.filter((g) => g._count.id > 1).length,
  };
}

export interface DataQualityProjectRow {
  id: string;
  name: string;
  localityName: string;
  completionPercent: number;
  updatedAt: Date;
}

export async function getLowestCompletionProjects(limit = 10): Promise<DataQualityProjectRow[]> {
  const rows = await prisma.project.findMany({
    where: LIVE_PROJECT_WHERE,
    orderBy: { completionPercent: "asc" },
    take: limit,
    select: { id: true, name: true, completionPercent: true, updatedAt: true, locality: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, localityName: r.locality.name, completionPercent: r.completionPercent, updatedAt: r.updatedAt }));
}

export async function getStalestProjects(limit = 10): Promise<DataQualityProjectRow[]> {
  const rows = await prisma.project.findMany({
    where: LIVE_PROJECT_WHERE,
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true, name: true, completionPercent: true, updatedAt: true, locality: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, localityName: r.locality.name, completionPercent: r.completionPercent, updatedAt: r.updatedAt }));
}

export async function getProjectsWithoutTransactions(limit = 10): Promise<DataQualityProjectRow[]> {
  const rows = await prisma.project.findMany({
    where: { ...LIVE_PROJECT_WHERE, transactions: { none: {} } },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { id: true, name: true, completionPercent: true, updatedAt: true, locality: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, localityName: r.locality.name, completionPercent: r.completionPercent, updatedAt: r.updatedAt }));
}

export interface DuplicateCandidateGroup {
  name: string;
  localityName: string;
  projects: { id: string; updatedAt: Date; completionPercent: number }[];
}

/** Exact name+locality collisions only — a fuzzy/near-duplicate matcher is future scope (the same matchConfidence machinery IngestStagingRecord already has for future ingestion), not invented here. */
export async function getDuplicateCandidates(limit = 10): Promise<DuplicateCandidateGroup[]> {
  const groups = await prisma.project.groupBy({ by: ["name", "localityId"], where: LIVE_PROJECT_WHERE, _count: { id: true } });
  const duplicateKeys = groups.filter((g) => g._count.id > 1).slice(0, limit);
  if (duplicateKeys.length === 0) return [];

  const rows = await prisma.project.findMany({
    where: { ...LIVE_PROJECT_WHERE, OR: duplicateKeys.map((k) => ({ name: k.name, localityId: k.localityId })) },
    select: { id: true, name: true, localityId: true, updatedAt: true, completionPercent: true, locality: { select: { name: true } } },
  });

  return duplicateKeys.map((k) => {
    const projects = rows.filter((r) => r.name === k.name && r.localityId === k.localityId);
    return {
      name: k.name,
      localityName: projects[0]?.locality.name ?? "--",
      projects: projects.map((p) => ({ id: p.id, updatedAt: p.updatedAt, completionPercent: p.completionPercent })),
    };
  });
}
