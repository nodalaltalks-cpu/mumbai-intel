"use server";

import { recordRecommendationClick } from "@/lib/recommendations/impressions";

/** Best-effort — a recommendation click-through must never block or break navigation to the project page. */
export async function recordRecommendationClickAction(projectId: string, surface: string, position: number): Promise<void> {
  try {
    await recordRecommendationClick(projectId, surface, position);
  } catch (error) {
    console.error("[recommendations] failed to record click", error);
  }
}
