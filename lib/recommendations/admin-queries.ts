import "server-only";
import { prisma } from "@/lib/prisma";

/** Admin — Recommendation Intelligence (Part 29 of the Recommendation Engine spec). Every number here is a real aggregate over ResearchEvent rows this engine itself wrote — never fabricated. */

export interface RecommendationOverview {
  totalImpressions: number;
  totalClicks: number;
  ctrPercent: number | null;
  distinctProjectsRecommended: number;
  publishedProjectCount: number;
}

export async function getRecommendationOverview(daysBack = 30): Promise<RecommendationOverview> {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const [totalImpressions, totalClicks, distinctProjects, publishedProjectCount] = await Promise.all([
    prisma.researchEvent.count({ where: { eventType: "RECOMMENDATION_IMPRESSION", createdAt: { gte: since } } }),
    prisma.researchEvent.count({ where: { eventType: "RECOMMENDATION_CLICKED", createdAt: { gte: since } } }),
    prisma.researchEvent.groupBy({ by: ["entityId"], where: { eventType: "RECOMMENDATION_IMPRESSION", createdAt: { gte: since } } }),
    prisma.project.count({ where: { isPublished: true, isArchived: false, deletedAt: null } }),
  ]);

  return {
    totalImpressions,
    totalClicks,
    ctrPercent: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 1000) / 10 : null,
    distinctProjectsRecommended: distinctProjects.length,
    publishedProjectCount,
  };
}

export interface TopRecommendedProject {
  projectId: string;
  projectName: string | null;
  projectSlug: string | null;
  impressions: number;
  clicks: number;
}

export async function getTopRecommendedProjects(daysBack = 30, limit = 10): Promise<TopRecommendedProject[]> {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const [impressionGroups, clickGroups] = await Promise.all([
    prisma.researchEvent.groupBy({
      by: ["entityId"],
      where: { eventType: "RECOMMENDATION_IMPRESSION", entityId: { not: null }, createdAt: { gte: since } },
      _count: { entityId: true },
      orderBy: { _count: { entityId: "desc" } },
      take: limit,
    }),
    prisma.researchEvent.groupBy({
      by: ["entityId"],
      where: { eventType: "RECOMMENDATION_CLICKED", entityId: { not: null }, createdAt: { gte: since } },
      _count: { entityId: true },
    }),
  ]);

  const clickCountById = new Map(clickGroups.map((g) => [g.entityId, g._count.entityId]));
  const projectIds = impressionGroups.map((g) => g.entityId).filter((id): id is string => id !== null);
  const projects = await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true, slug: true } });
  const projectById = new Map(projects.map((p) => [p.id, p]));

  return impressionGroups
    .filter((g): g is typeof g & { entityId: string } => g.entityId !== null)
    .map((g) => ({
      projectId: g.entityId,
      projectName: projectById.get(g.entityId)?.name ?? null,
      projectSlug: projectById.get(g.entityId)?.slug ?? null,
      impressions: g._count.entityId,
      clicks: clickCountById.get(g.entityId) ?? 0,
    }));
}

export interface RecommendationSurfaceBreakdown {
  surface: string;
  impressions: number;
  clicks: number;
}

/**
 * Impressions carry `surface` inside metadata (JSON), not a column — Prisma
 * can't groupBy a JSON path on the Neon HTTP adapter's query surface, so
 * this reads a bounded recent window into memory and aggregates in JS. Kept
 * to a real cap (last 2,000 rows) so this never becomes an unbounded scan
 * as event volume grows (Part 17: bounded queries).
 */
export async function getRecommendationSurfaceBreakdown(daysBack = 30): Promise<RecommendationSurfaceBreakdown[]> {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const [impressions, clicks] = await Promise.all([
    prisma.researchEvent.findMany({
      where: { eventType: "RECOMMENDATION_IMPRESSION", createdAt: { gte: since } },
      select: { metadata: true },
      take: 2000,
      orderBy: { createdAt: "desc" },
    }),
    prisma.researchEvent.findMany({
      where: { eventType: "RECOMMENDATION_CLICKED", createdAt: { gte: since } },
      select: { metadata: true },
      take: 2000,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  function surfaceOf(metadata: unknown): string {
    if (metadata && typeof metadata === "object" && "surface" in metadata && typeof (metadata as { surface?: unknown }).surface === "string") {
      return (metadata as { surface: string }).surface;
    }
    return "unknown";
  }

  const counts = new Map<string, { impressions: number; clicks: number }>();
  for (const row of impressions) {
    const key = surfaceOf(row.metadata);
    const entry = counts.get(key) ?? { impressions: 0, clicks: 0 };
    entry.impressions += 1;
    counts.set(key, entry);
  }
  for (const row of clicks) {
    const key = surfaceOf(row.metadata);
    const entry = counts.get(key) ?? { impressions: 0, clicks: 0 };
    entry.clicks += 1;
    counts.set(key, entry);
  }

  return [...counts.entries()].map(([surface, v]) => ({ surface, ...v })).sort((a, b) => b.impressions - a.impressions);
}

export interface RecentRecommendationRow {
  id: string;
  createdAt: Date;
  projectName: string | null;
  reasons: string[];
  candidateSources: string[];
  score: number | null;
  surface: string | null;
  isRegistered: boolean;
  /** Phase 2 — present only when ML shadow/active scoring ran for this impression. */
  mlScore: number | null;
  mlModelVersion: string | null;
}

/** Part 30/Phase 2 Part 15 "why was this recommended" — recent impressions with their reasons (and ML score/version when shadow-scored), no per-user drill-down UI yet (deferred; see final report). */
export async function getRecentRecommendationImpressions(limit = 25): Promise<RecentRecommendationRow[]> {
  const rows = await prisma.researchEvent.findMany({
    where: { eventType: "RECOMMENDATION_IMPRESSION" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, createdAt: true, entityId: true, metadata: true, publicUserId: true },
  });
  const projectIds = [...new Set(rows.map((r) => r.entityId).filter((id): id is string => id !== null))];
  const projects = await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } });
  const nameById = new Map(projects.map((p) => [p.id, p.name]));

  return rows.map((r) => {
    const meta = (r.metadata ?? {}) as { reasons?: string[]; candidateSources?: string[]; score?: number; surface?: string; mlScore?: number; mlModelVersion?: string };
    return {
      id: r.id,
      createdAt: r.createdAt,
      projectName: r.entityId ? (nameById.get(r.entityId) ?? null) : null,
      reasons: meta.reasons ?? [],
      candidateSources: meta.candidateSources ?? [],
      score: meta.score ?? null,
      surface: meta.surface ?? null,
      isRegistered: r.publicUserId !== null,
      mlScore: meta.mlScore ?? null,
      mlModelVersion: meta.mlModelVersion ?? null,
    };
  });
}
