import "server-only";
import { prisma } from "@/lib/prisma";
import { getRankingMode } from "./mode";
import { checkRetrainingNeeded } from "./train";
import type { RecommendationModelVersion } from "@prisma/client";

/** Part 21 — Admin ML dashboard data. Reads only, never invents a metric that isn't already stored on a real trained/attempted model version. */
export async function getModelVersionHistory(limit = 10): Promise<RecommendationModelVersion[]> {
  return prisma.recommendationModelVersion.findMany({ orderBy: { trainedAt: "desc" }, take: limit });
}

export async function getCurrentModel(): Promise<RecommendationModelVersion | null> {
  return prisma.recommendationModelVersion.findFirst({
    where: { status: { in: ["ACTIVE", "SHADOW"] } },
    orderBy: { trainedAt: "desc" },
  });
}

export interface MlDashboardData {
  rankingMode: Awaited<ReturnType<typeof getRankingMode>>;
  currentModel: RecommendationModelVersion | null;
  history: RecommendationModelVersion[];
  retraining: Awaited<ReturnType<typeof checkRetrainingNeeded>>;
}

export async function getMlDashboardData(): Promise<MlDashboardData> {
  const [rankingMode, currentModel, history, retraining] = await Promise.all([getRankingMode(), getCurrentModel(), getModelVersionHistory(10), checkRetrainingNeeded()]);
  return { rankingMode, currentModel, history, retraining };
}

/**
 * Part 22 — recommendation health, extended for Phase 2: compares the two
 * most recent EVALUATED-or-later model versions' holdout metrics to flag
 * degradation (Part 20 drift signal). Returns null when fewer than 2
 * comparable versions exist — never fabricates a trend from one data point.
 */
export interface ModelDriftCheck {
  degraded: boolean;
  message: string | null;
  previousVersion: string;
  currentVersion: string;
}

export async function checkModelPerformanceDrift(): Promise<ModelDriftCheck | null> {
  const versions = await prisma.recommendationModelVersion.findMany({
    where: { status: { in: ["EVALUATED", "SHADOW", "ACTIVE"] } },
    orderBy: { trainedAt: "desc" },
    take: 2,
  });
  if (versions.length < 2) return null;

  const [current, previous] = versions;
  const currentCtr = (current.metricsJson as { holdout?: { ml?: { ctr?: number } } } | null)?.holdout?.ml?.ctr;
  const previousCtr = (previous.metricsJson as { holdout?: { ml?: { ctr?: number } } } | null)?.holdout?.ml?.ctr;

  if (typeof currentCtr !== "number" || typeof previousCtr !== "number" || previousCtr === 0) {
    return { degraded: false, message: null, previousVersion: previous.version, currentVersion: current.version };
  }

  const changePercent = Math.round(((currentCtr - previousCtr) / previousCtr) * 100);
  const degraded = changePercent <= -20; // a defensible, documented threshold: a 1/5 relative CTR drop is a real regression, not noise, for holdout sets already gated at >=40 examples (score.ts's MIN_CONFIDENT_HOLDOUT_SIZE)
  return {
    degraded,
    message: degraded ? `ML recommendation CTR decreased ${Math.abs(changePercent)}% from ${previous.version} to ${current.version}.` : null,
    previousVersion: previous.version,
    currentVersion: current.version,
  };
}
