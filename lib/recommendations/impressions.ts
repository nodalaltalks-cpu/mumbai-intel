import "server-only";
import { after } from "next/server";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import type { ScoredProject } from "./types";
import type { MlScoredItem } from "./ml/score";

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
 *
 * `publicUserId` and `sessionId` MUST both be resolved by the caller before
 * this is invoked, not looked up inside the callback — `cookies()` (and
 * therefore getPublicSession()/peekAnonSessionId()) throws when called
 * inside `after()`. Every caller here already has both on hand from its
 * own top-level `getPublicSession()`/`peekAnonSessionId()` read.
 */
export function recordRecommendationImpressions(items: (ScoredProject | MlScoredItem)[], surface: string, publicUserId: string | null, sessionId: string | null) {
  after(async () => {
    await Promise.all(
      items.map((item, position) => {
        const ml = "mlScore" in item ? item : null;
        return recordResearchEvent("RECOMMENDATION_IMPRESSION", {
          entityType: "Project",
          entityId: item.project.id,
          publicUserId,
          sessionId,
          metadata: {
            surface,
            position,
            score: Math.round(item.score),
            reasons: item.reasons.map((r) => r.label),
            candidateSources: item.sources,
            // Phase 2 shadow logging (Part 8/9) — null/absent whenever ML
            // scoring didn't run (mode PHASE1_ONLY), so this stays a no-op
            // addition to every existing impression row shape.
            ...(ml?.mlScore !== null && ml?.mlScore !== undefined ? { mlScore: Math.round(ml.mlScore * 1000) / 1000 } : {}),
            ...(ml?.mlModelVersion ? { mlModelVersion: ml.mlModelVersion } : {}),
          },
        });
      })
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
