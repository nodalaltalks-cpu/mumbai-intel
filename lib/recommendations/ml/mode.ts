import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Part 18 — "the Founder must be able to safely revert to the
 * deterministic Phase 1 ranking... rollback must not depend on a code
 * deployment... use the existing configuration/settings architecture."
 * Reuses the existing generic SiteSetting key-value table (see
 * lib/actions/settings.ts's identical find-then-update-or-create pattern,
 * required because the Neon HTTP adapter has no upsert()) — no new table.
 */
export const RANKING_MODE_KEY = "recommendation_ranking_mode";

export type RankingMode = "PHASE1_ONLY" | "ML_SHADOW" | "ML_ENABLED";
export const DEFAULT_RANKING_MODE: RankingMode = "PHASE1_ONLY";

function isValidMode(value: string | null): value is RankingMode {
  return value === "PHASE1_ONLY" || value === "ML_SHADOW" || value === "ML_ENABLED";
}

export async function getRankingMode(): Promise<RankingMode> {
  const row = await prisma.siteSetting.findUnique({ where: { key: RANKING_MODE_KEY } });
  return isValidMode(row?.value ?? null) ? (row!.value as RankingMode) : DEFAULT_RANKING_MODE;
}

export async function setRankingMode(mode: RankingMode): Promise<void> {
  const existing = await prisma.siteSetting.findUnique({ where: { key: RANKING_MODE_KEY } });
  if (existing) {
    await prisma.siteSetting.update({ where: { key: RANKING_MODE_KEY }, data: { value: mode } });
  } else {
    await prisma.siteSetting.create({ data: { key: RANKING_MODE_KEY, value: mode } });
  }
}
