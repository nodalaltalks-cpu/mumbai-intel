import "server-only";
import { after } from "next/server";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import type { ScoredProject } from "./types";

/**
 * Part 15/16 — one RECOMMENDATION_IMPRESSION row per project actually shown,
 * with the "why" and position attached, so admin analytics (CTR, top
 * recommended projects) can group by entityId directly instead of parsing
 * a batched blob. Scheduled via Next's `after()` so these writes never
 * delay the page response the recommendations are rendered into (Part 38:
 * recommendations must not noticeably slow rendering) — this is genuinely
 * new event volume (unlike a heartbeat), so it must not block, per Part 38,
 * while still landing reliably (after() runs post-response on Vercel, not
 * best-effort client-side).
 */
export function recordRecommendationImpressions(items: ScoredProject[], surface: string, sessionId?: string | null) {
  after(async () => {
    await Promise.all(
      items.map((item, position) =>
        recordResearchEvent("RECOMMENDATION_IMPRESSION", {
          entityType: "Project",
          entityId: item.project.id,
          sessionId,
          metadata: {
            surface,
            position,
            score: Math.round(item.score),
            reasons: item.reasons.map((r) => r.label),
            candidateSources: item.sources,
          },
        })
      )
    );
  });
}

/** Fired from the project card click-through when it originated in a recommendation surface — distinct from the plain PROJECT_VIEWED that already fires on the detail page itself. */
export async function recordRecommendationClick(projectId: string, surface: string, position: number) {
  await recordResearchEvent("RECOMMENDATION_CLICKED", {
    entityType: "Project",
    entityId: projectId,
    metadata: { surface, position },
  });
}
