import "server-only";
import { prisma } from "@/lib/prisma";
import { buildTrainingDataset, type LabeledExample } from "./dataset";
import { trainLogisticRegression, DEFAULT_TRAIN_OPTIONS, type LogisticModelWeights } from "./model";
import { evaluateModel, evaluatePhase1 } from "./evaluate";
import { FEATURE_NAMES } from "./features";
import { FEATURE_VERSION } from "./features";
import type { Prisma, RecommendationModelVersion } from "@prisma/client";

/**
 * Part 5/29 — data-sufficiency thresholds. Documented, not arbitrary:
 *
 * MIN_LABELED_EXAMPLES = 200: logistic regression here has 18 real
 * features (FEATURE_NAMES minus the bias placeholder). A widely-used rule
 * of thumb for a linear model is ~10-20 labeled examples per feature to
 * avoid fitting noise rather than signal — 18 * 10 ≈ 180, rounded up.
 *
 * MIN_POSITIVE_EXAMPLES = 30: both classes (clicked / not clicked) need
 * enough representation for gradient descent to learn a real boundary
 * rather than a degenerate always-predict-majority-class model.
 *
 * MIN_DISTINCT_PROJECTS = 5: the model's locality/source features are
 * meaningless if every example comes from the same 1-2 projects — there's
 * nothing to discriminate between.
 *
 * MIN_DISTINCT_SUBJECTS = 20: guards against overfitting to a handful of
 * individuals' idiosyncratic behavior rather than a generalizable pattern.
 */
export const SUFFICIENCY_THRESHOLDS = {
  minLabeledExamples: 200,
  minPositiveExamples: 30,
  minDistinctProjects: 5,
  minDistinctSubjects: 20,
};

export interface SufficiencyCheck {
  sufficient: boolean;
  labeledExamples: number;
  positiveExamples: number;
  distinctProjects: number;
  distinctSubjects: number;
  reasons: string[];
}

export function checkDataSufficiency(examples: LabeledExample[]): SufficiencyCheck {
  const positiveExamples = examples.filter((e) => e.binaryLabel === 1).length;
  const distinctProjects = new Set(examples.map((e) => e.projectId)).size;
  const distinctSubjects = new Set(examples.map((e) => e.publicUserId ?? e.sessionId ?? "anon")).size;

  const reasons: string[] = [];
  if (examples.length < SUFFICIENCY_THRESHOLDS.minLabeledExamples) reasons.push(`only ${examples.length} labeled examples (need ${SUFFICIENCY_THRESHOLDS.minLabeledExamples})`);
  if (positiveExamples < SUFFICIENCY_THRESHOLDS.minPositiveExamples) reasons.push(`only ${positiveExamples} positive (clicked) examples (need ${SUFFICIENCY_THRESHOLDS.minPositiveExamples})`);
  if (distinctProjects < SUFFICIENCY_THRESHOLDS.minDistinctProjects) reasons.push(`only ${distinctProjects} distinct projects recommended (need ${SUFFICIENCY_THRESHOLDS.minDistinctProjects})`);
  if (distinctSubjects < SUFFICIENCY_THRESHOLDS.minDistinctSubjects) reasons.push(`only ${distinctSubjects} distinct users/sessions (need ${SUFFICIENCY_THRESHOLDS.minDistinctSubjects})`);

  return { sufficient: reasons.length === 0, labeledExamples: examples.length, positiveExamples, distinctProjects, distinctSubjects, reasons };
}

function nextModelVersionLabel(existingVersions: string[]): string {
  const numbers = existingVersions.map((v) => parseInt(v.replace(/^v/, ""), 10)).filter((n) => !Number.isNaN(n));
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return `v${next}`;
}

export interface TrainRunResult {
  modelVersion: RecommendationModelVersion;
  sufficiency: SufficiencyCheck;
}

/**
 * Part 19 — "initially: manual/scheduled training." No cron exists for
 * this (this Vercel project is already at its Hobby-plan daily-cron
 * ceiling — see app/api/cron/platform-metrics/route.ts's comment) — this
 * is invoked by the Founder's "Train Model Now" admin action
 * (lib/actions/recommendation-ml.ts). checkRetrainingNeeded() below is the
 * seam a future scheduled job would call before deciding to actually train.
 */
export async function runTrainingPipeline(trainedByUserId: string | null): Promise<TrainRunResult> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 90 * 24 * 60 * 60 * 1000); // 90-day window — long enough to accumulate signal without training on stale, no-longer-representative behavior

  const { examples, rawInteractionCount } = await buildTrainingDataset(periodStart, periodEnd);
  const sufficiency = checkDataSufficiency(examples);

  const existingVersions = await prisma.recommendationModelVersion.findMany({ select: { version: true } });
  const version = nextModelVersionLabel(existingVersions.map((v) => v.version));

  const distinctUserCount = new Set(examples.map((e) => e.publicUserId).filter((id): id is string => id !== null)).size;
  const distinctProjectCount = new Set(examples.map((e) => e.projectId)).size;

  if (!sufficiency.sufficient) {
    const modelVersion = await prisma.recommendationModelVersion.create({
      data: {
        version,
        modelType: "LOGISTIC_REGRESSION",
        status: "INSUFFICIENT_DATA",
        trainingPeriodStart: periodStart,
        trainingPeriodEnd: periodEnd,
        datasetSize: examples.length,
        interactionCount: rawInteractionCount,
        distinctUserCount,
        distinctProjectCount,
        featureVersion: FEATURE_VERSION,
        weightsJson: undefined,
        metricsJson: { sufficiency } as unknown as Prisma.InputJsonValue,
        trainedByUserId,
        notes: `Insufficient data: ${sufficiency.reasons.join("; ")}`,
      },
    });
    return { modelVersion, sufficiency };
  }

  // Time-based 80/20 split — train on the earlier period, evaluate on the
  // most recent slice (Part 11: "do not train and evaluate on the exact
  // same events" / "avoid data leakage").
  const sorted = [...examples].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const splitIndex = Math.floor(sorted.length * 0.8);
  const trainSet = sorted.slice(0, splitIndex);
  const holdoutSet = sorted.slice(splitIndex);

  const model: LogisticModelWeights = trainLogisticRegression(
    trainSet.map((e) => e.featureVector),
    trainSet.map((e) => e.binaryLabel),
    FEATURE_NAMES,
    DEFAULT_TRAIN_OPTIONS
  );

  const mlHoldoutMetrics = evaluateModel(holdoutSet, model);
  const phase1HoldoutMetrics = evaluatePhase1(holdoutSet);

  const modelVersion = await prisma.recommendationModelVersion.create({
    data: {
      version,
      modelType: "LOGISTIC_REGRESSION",
      status: "EVALUATED",
      trainingPeriodStart: periodStart,
      trainingPeriodEnd: periodEnd,
      datasetSize: examples.length,
      interactionCount: rawInteractionCount,
      distinctUserCount,
      distinctProjectCount,
      featureVersion: FEATURE_VERSION,
      weightsJson: { weights: model.weights, bias: model.bias, featureNames: model.featureNames } as unknown as Prisma.InputJsonValue,
      metricsJson: {
        sufficiency,
        trainSetSize: trainSet.length,
        holdoutSetSize: holdoutSet.length,
        holdout: { ml: mlHoldoutMetrics, phase1: phase1HoldoutMetrics },
      } as unknown as Prisma.InputJsonValue,
      trainedByUserId,
    },
  });

  return { modelVersion, sufficiency };
}

/**
 * Part 19 — "the system should eventually be able to determine 'enough new
 * data exists to justify retraining.'" Real, but simple: enough NEW
 * impressions since the last trained version's training window ended.
 * Threshold mirrors minLabeledExamples — the same bar a fresh training run
 * would need to clear anyway.
 */
export async function checkRetrainingNeeded(): Promise<{ needed: boolean; newInteractionsSinceLastTrain: number }> {
  const lastVersion = await prisma.recommendationModelVersion.findFirst({ orderBy: { trainedAt: "desc" }, select: { trainingPeriodEnd: true } });
  const since = lastVersion?.trainingPeriodEnd ?? new Date(0);
  const newInteractionsSinceLastTrain = await prisma.researchEvent.count({ where: { eventType: "RECOMMENDATION_IMPRESSION", createdAt: { gt: since } } });
  return { needed: newInteractionsSinceLastTrain >= SUFFICIENCY_THRESHOLDS.minLabeledExamples, newInteractionsSinceLastTrain };
}
