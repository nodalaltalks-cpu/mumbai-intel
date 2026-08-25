"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { runTrainingPipeline } from "@/lib/recommendations/ml/train";
import { getRankingMode, setRankingMode, type RankingMode } from "@/lib/recommendations/ml/mode";
import type { RecommendationModelStatus } from "@prisma/client";

export interface TrainModelActionState {
  error?: string;
  success?: boolean;
  status?: RecommendationModelStatus;
  version?: string;
}

/**
 * Part 19 — the manual trigger this phase relies on (no automatic
 * retraining cron exists — see lib/recommendations/ml/train.ts's doc
 * comment on why). Founder/Admin only, same gate as every other
 * infrastructure-level control in this codebase (Platform Health).
 */
export async function trainModelNowAction(): Promise<TrainModelActionState> {
  const session = await requireAdminSession();
  const { modelVersion } = await runTrainingPipeline(session.userId);
  await logAudit(session.userId, "recommendation-ml.train", "RecommendationModelVersion", modelVersion.id);
  revalidatePath("/admin/recommendations");
  return { success: true, status: modelVersion.status, version: modelVersion.version };
}

export interface RankingModeActionState {
  error?: string;
  success?: boolean;
}

/** Part 18 — rollback lever. Setting PHASE1_ONLY makes ML scoring a complete no-op regardless of any model's status, independent of any deployment. */
export async function setRankingModeAction(mode: RankingMode): Promise<RankingModeActionState> {
  const session = await requireAdminSession();
  const previous = await getRankingMode();
  await setRankingMode(mode);
  await logAudit(session.userId, "recommendation-ml.ranking-mode.update", "SiteSetting", "recommendation_ranking_mode", { before: { mode: previous }, after: { mode } });
  revalidatePath("/admin/recommendations");
  return { success: true };
}

const PROMOTABLE_FROM: Partial<Record<RecommendationModelStatus, RecommendationModelStatus[]>> = {
  EVALUATED: ["SHADOW", "ARCHIVED"],
  SHADOW: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["ARCHIVED"],
};

/** Founder-controlled model lifecycle (Part 17/18) — a deliberately small, explicit transition table rather than allowing an arbitrary status write. Promoting a model to ACTIVE archives any other currently-ACTIVE version, so at most one model is ever "in play" at a time. */
export async function setModelStatusAction(modelVersionId: string, newStatus: RecommendationModelStatus): Promise<RankingModeActionState> {
  const session = await requireAdminSession();

  const model = await prisma.recommendationModelVersion.findUnique({ where: { id: modelVersionId } });
  if (!model) return { error: "Model version not found" };

  const allowed = PROMOTABLE_FROM[model.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return { error: `Cannot move a model from ${model.status} to ${newStatus}` };
  }

  if (newStatus === "ACTIVE") {
    const others = await prisma.recommendationModelVersion.findMany({ where: { status: "ACTIVE", id: { not: modelVersionId } }, select: { id: true } });
    for (const other of others) {
      await prisma.recommendationModelVersion.update({ where: { id: other.id }, data: { status: "ARCHIVED" } });
    }
  }

  await prisma.recommendationModelVersion.update({ where: { id: modelVersionId }, data: { status: newStatus } });
  await logAudit(session.userId, "recommendation-ml.model.status-change", "RecommendationModelVersion", modelVersionId, { before: { status: model.status }, after: { status: newStatus } });
  revalidatePath("/admin/recommendations");
  return { success: true };
}
