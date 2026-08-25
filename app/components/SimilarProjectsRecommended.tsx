import { peekAnonSessionId } from "@/lib/analytics/session-id";
import { getSimilarToProject } from "@/lib/recommendations/service";
import { recordRecommendationImpressions } from "@/lib/recommendations/impressions";
import { maskProjectBrochure } from "@/lib/premium/mask";
import RecommendationGrid from "@/app/components/RecommendationGrid";

/**
 * "You may also consider" (Part 24) — distinct from the existing "Nearby
 * Projects" section on the same page (getRelatedProjects: locality/builder
 * match only, no scoring/reasons). This adds price-band-aware similarity
 * scoring and a human-readable reason per card, without replacing or
 * altering the existing section.
 */
export default async function SimilarProjectsRecommended({
  project,
  locked,
}: {
  project: { id: string; localityId: string; builderId: string | null };
  locked: boolean;
}) {
  const [items, sessionId] = await Promise.all([getSimilarToProject(project, 4), peekAnonSessionId()]);
  if (items.length === 0) return null;

  recordRecommendationImpressions(items, "project_detail_similar", sessionId);

  const cardItems = items.map((item) => ({
    projectId: item.project.id,
    project: maskProjectBrochure(item.project, locked),
    reasonLabel: item.reasons[0]?.label ?? "Similar to this project",
  }));

  return (
    <div>
      <h2 className="font-mono text-lg font-semibold text-foreground">You May Also Consider</h2>
      <div className="mt-3">
        <RecommendationGrid items={cardItems} surface="project_detail_similar" />
      </div>
    </div>
  );
}
