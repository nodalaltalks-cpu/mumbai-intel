import "server-only";
import { prisma } from "@/lib/prisma";
import { buildFeatureVector, FEATURE_VERSION, type ProjectFeatureInput } from "./features";
import { predictProbability, topContributingFeatures, type LogisticModelWeights } from "./model";
import { getRankingMode } from "./mode";
import type { ScoredProject, UserInterestSnapshot } from "../types";

/**
 * Part 8/9/13/14 — live ML shadow/active scoring layered onto Phase 1's
 * already-ranked, already-diversified output. Never a replacement
 * pipeline: candidate generation, filtering, and diversification all stay
 * Phase 1's (lib/recommendations/candidates.ts, rank.ts) — only the FINAL
 * ordering can change, and only under ML_ENABLED with a confident model.
 *
 * Part 27 (capacity impact): this adds exactly one extra batched Prisma
 * query (project configuration/freshness for the already-small candidate
 * set, typically <=8 rows) and pure in-memory arithmetic — no additional
 * per-candidate DB round trips. It only runs at all when ranking mode is
 * ML_SHADOW or ML_ENABLED (default is PHASE1_ONLY — zero cost until a
 * Founder explicitly turns it on).
 */

export interface MlScoredItem extends ScoredProject {
  mlScore: number | null;
  mlModelVersion: string | null;
  mlTopFeatures: { name: string; contribution: number }[] | null;
}

/** Minimum holdout examples a model must have been evaluated on before it's ever allowed to actually re-rank (ML_ENABLED) rather than just shadow-log (Part 13: "if confidence is low... fall back to Phase 1 deterministic ranking. Do NOT force ML recommendations."). */
const MIN_CONFIDENT_HOLDOUT_SIZE = 40;

function isConfident(metricsJson: unknown): boolean {
  if (!metricsJson || typeof metricsJson !== "object") return false;
  const holdoutSetSize = (metricsJson as { holdoutSetSize?: number }).holdoutSetSize;
  return typeof holdoutSetSize === "number" && holdoutSetSize >= MIN_CONFIDENT_HOLDOUT_SIZE;
}

export interface ApplyMlResult {
  items: MlScoredItem[];
  mode: Awaited<ReturnType<typeof getRankingMode>>;
  modelVersion: string | null;
  modelConfident: boolean;
  reordered: boolean;
}

/**
 * Applies ML scoring/re-ranking on top of an already Phase-1-ranked,
 * diversified list. Always returns a usable list — falls back to the
 * untouched Phase 1 order whenever mode is PHASE1_ONLY, no trained model
 * exists, or the model isn't confident enough (Part 13).
 */
export async function applyMlScoring(phase1Items: ScoredProject[], interest: UserInterestSnapshot): Promise<ApplyMlResult> {
  const mode = await getRankingMode();
  const passthrough: MlScoredItem[] = phase1Items.map((item) => ({ ...item, mlScore: null, mlModelVersion: null, mlTopFeatures: null }));

  if (mode === "PHASE1_ONLY" || phase1Items.length === 0) {
    return { items: passthrough, mode, modelVersion: null, modelConfident: false, reordered: false };
  }

  const activeOrShadow = await prisma.recommendationModelVersion.findFirst({
    where: { status: { in: ["ACTIVE", "SHADOW"] }, featureVersion: FEATURE_VERSION },
    orderBy: { trainedAt: "desc" },
  });
  if (!activeOrShadow || !activeOrShadow.weightsJson) {
    return { items: passthrough, mode, modelVersion: null, modelConfident: false, reordered: false };
  }

  const model = activeOrShadow.weightsJson as unknown as LogisticModelWeights;
  const confident = activeOrShadow.status === "ACTIVE" && isConfident(activeOrShadow.metricsJson);

  const projectIds = phase1Items.map((i) => i.project.id);
  const projectDetails = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, localityId: true, priceMinPaise: true, priceMaxPaise: true, createdAt: true, configurations: { select: { bedrooms: true } } },
  });
  const detailById = new Map(projectDetails.map((p) => [p.id, p]));

  const scored: MlScoredItem[] = phase1Items.map((item, position) => {
    const detail = detailById.get(item.project.id);
    if (!detail) return { ...item, mlScore: null, mlModelVersion: activeOrShadow.version, mlTopFeatures: null };

    const projectFeatureInput: ProjectFeatureInput = {
      id: detail.id,
      localityId: detail.localityId,
      priceMinPaise: detail.priceMinPaise !== null ? Number(detail.priceMinPaise) : null,
      priceMaxPaise: detail.priceMaxPaise !== null ? Number(detail.priceMaxPaise) : null,
      configurationBedrooms: detail.configurations.map((c) => Number(c.bedrooms)),
      createdAt: detail.createdAt,
    };
    const featureVector = buildFeatureVector(projectFeatureInput, interest, {
      source: item.sources[0] ?? "EXPLORATION",
      position,
      totalCandidates: phase1Items.length,
    });
    const mlScore = predictProbability(model, featureVector);
    const mlTopFeatures = topContributingFeatures(model, featureVector);

    return { ...item, mlScore, mlModelVersion: activeOrShadow.version, mlTopFeatures };
  });

  const reordered = mode === "ML_ENABLED" && confident;
  const finalItems = reordered ? [...scored].sort((a, b) => (b.mlScore ?? 0) - (a.mlScore ?? 0)) : scored;

  return { items: finalItems, mode, modelVersion: activeOrShadow.version, modelConfident: confident, reordered };
}
