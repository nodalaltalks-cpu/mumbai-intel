import type { ResearchEventType } from "@prisma/client";

/**
 * Real research-intent signals — the same event set getResearchFunnel
 * (lib/analytics/research-funnel-queries.ts) already treats as "actually
 * researching," as opposed to a bare page arrival (LANDING_PAGE_VIEWED,
 * PROJECT_CARD_CLICKED alone). Shared here so the admin Visitors page's
 * "anonymous → active researcher" definition never drifts from the
 * signed-in research funnel's own definition of the same idea.
 */
export const INTENT_EVENT_TYPES: ResearchEventType[] = [
  "SEARCH_PERFORMED",
  "FILTERS_USED",
  "TRANSACTION_SEARCHED",
  "TRANSACTION_FILTER_APPLIED",
  "PROJECT_VIEWED",
  "COMPARE_USED",
  "WISHLIST_ADDED",
  "TRANSACTION_VIEWED",
  "REPORT_VIEWED",
  "MARKET_DATA_VIEWED",
  "INSIGHTS_VIEWED",
];
