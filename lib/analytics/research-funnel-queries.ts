import "server-only";
import { prisma } from "@/lib/prisma";
import type { ResearchEventType } from "@prisma/client";
import type { AnalyticsPeriod } from "./period";

/**
 * A REAL funnel, not an aspirational one: every stage below maps to an event
 * this codebase already records (ResearchEvent / BrochureDownloadEvent).
 * "Future Consultation" from the original ask has no shipped feature behind
 * it yet, so it's deliberately not a stage here — add it once it exists.
 *
 * Scoped to signed-in users (publicUserId), the same groupBy-on-publicUserId
 * pattern already proven in getUserGrowthStats — anonymous session-only
 * traffic isn't included. That's a real limitation, not hidden: this is a
 * "signed-in research funnel," not total-traffic funnel analysis (GA already
 * covers raw traffic; this is about researchers we can actually identify).
 *
 * Each stage is counted independently ("distinct users who did X in the
 * window"), not strict in-order path analysis -- a lightweight proxy funnel,
 * the same tradeoff most product dashboards make rather than full sequence
 * mining, which would need raw SQL this codebase doesn't otherwise use.
 *
 * The window used to be a fixed 30 days; it now comes from the shared
 * AnalyticsPeriod (Section 34/37) so this funnel moves with the same
 * Day/Week/Month/... filter as the rest of the analytics section.
 */

export interface FunnelStage {
  key: string;
  label: string;
  userCount: number;
}

export interface ResearchFunnelResult {
  periodLabel: string;
  stages: FunnelStage[];
}

async function distinctUsers(eventTypes: ResearchEventType[], since: Date, until: Date): Promise<number> {
  const groups = await prisma.researchEvent.groupBy({
    by: ["publicUserId"],
    where: { eventType: { in: eventTypes }, publicUserId: { not: null }, createdAt: { gte: since, lt: until } },
  });
  return groups.length;
}

export async function getResearchFunnel(period: AnalyticsPeriod): Promise<ResearchFunnelResult> {
  const { since, until } = period;

  const [searched, viewedProject, engaged, viewedTransaction, viewedIntelligence, downloadedBrochureGroups] = await Promise.all([
    distinctUsers(["SEARCH_PERFORMED", "FILTERS_USED", "TRANSACTION_SEARCHED", "TRANSACTION_FILTER_APPLIED"], since, until),
    distinctUsers(["PROJECT_VIEWED"], since, until),
    distinctUsers(["COMPARE_USED", "WISHLIST_ADDED"], since, until),
    distinctUsers(["TRANSACTION_VIEWED"], since, until),
    distinctUsers(["REPORT_VIEWED", "MARKET_DATA_VIEWED", "INSIGHTS_VIEWED"], since, until),
    prisma.brochureDownloadEvent.groupBy({
      by: ["publicUserId"],
      where: { eventType: "DOWNLOAD_COMPLETED", publicUserId: { not: null }, createdAt: { gte: since, lt: until } },
    }),
  ]);

  return {
    periodLabel: period.label,
    stages: [
      { key: "searched", label: "Searched or Filtered", userCount: searched },
      { key: "viewed_project", label: "Viewed a Project", userCount: viewedProject },
      { key: "engaged", label: "Compared or Wishlisted", userCount: engaged },
      { key: "viewed_transaction", label: "Viewed Transaction Data", userCount: viewedTransaction },
      { key: "viewed_intelligence", label: "Viewed a Report / Market Data / Insight", userCount: viewedIntelligence },
      { key: "downloaded_brochure", label: "Downloaded a Brochure", userCount: downloadedBrochureGroups.length },
    ],
  };
}
