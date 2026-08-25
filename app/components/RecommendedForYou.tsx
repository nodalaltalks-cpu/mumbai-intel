import { getPublicSession } from "@/lib/public-auth/session";
import { peekAnonSessionId } from "@/lib/analytics/session-id";
import { getRecommendationsForUser } from "@/lib/recommendations/service";
import { recordRecommendationImpressions } from "@/lib/recommendations/impressions";
import { maskProjectBrochure } from "@/lib/premium/mask";
import RecommendationGrid from "@/app/components/RecommendationGrid";
import SectionHeading from "@/app/components/ui/SectionHeading";

/**
 * "Recommended for you" (Part 23 of the Recommendation Engine spec) —
 * server-rendered, personalized for a signed-in visitor, cold-start
 * (trending + new) for an anonymous one. Distinct from "Continue Research"
 * (Part 27 — that's the existing /account "Recently Viewed" surface, things
 * the user already looked at; this is what the engine thinks they should
 * look at next).
 */
export default async function RecommendedForYou({ surface = "homepage" }: { surface?: string }) {
  const [session, sessionId] = await Promise.all([getPublicSession(), peekAnonSessionId()]);
  const { items, isColdStart } = await getRecommendationsForUser(session?.userId ?? null, 8);
  if (items.length === 0) return null;

  recordRecommendationImpressions(items, surface, session?.userId ?? null, sessionId);

  const locked = session === null;
  const cardItems = items.map((item) => ({
    projectId: item.project.id,
    project: maskProjectBrochure(item.project, locked),
    reasonLabel: item.reasons[0]?.label ?? "Recommended for you",
  }));

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <SectionHeading
        title={isColdStart ? "Popular Right Now" : "Recommended For You"}
        subtitle={isColdStart ? "Trending and newly added projects — sign in and start researching for a personalized list." : "Based on your recent research."}
      />
      <RecommendationGrid items={cardItems} surface={surface} />
    </section>
  );
}
