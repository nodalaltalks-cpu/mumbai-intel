/**
 * The Analytics Engine — the ONLY place statistics, scores and rankings are
 * calculated anywhere in Mumbai Intel. Pages and query functions fetch rows
 * from Postgres (the repository concern) and pass them here (the business
 * logic concern); nothing ever computes a median, average, or score inline.
 */
export { TransactionAnalyticsService } from "./transactionAnalytics";
export type {
  TransactionStats,
  TransactionMonthlyPoint,
  ConfigurationBucket,
  PropertyTypeBucket,
  TransactionPriceRow,
  TransactionStatsRow,
  TransactionMonthlyRow,
} from "./transactionAnalytics";

export { DeveloperAnalyticsService, ALL_PROJECT_STATUSES, DELIVERED_STATUSES, UNDER_CONSTRUCTION_STATUSES, UPCOMING_STATUSES } from "./developerAnalytics";
export type { DeveloperProjectRow, DeveloperPortfolioBreakdown } from "./developerAnalytics";

export { LocalityAnalyticsService } from "./localityAnalytics";
export type { LocalityIntelligence, DemandLabel, SupplyLabel } from "./localityAnalytics";

export { ProjectAnalyticsService } from "./projectAnalytics";
export type { ConfigurationForCard, ProjectCardFields } from "./projectAnalytics";

export { MarketAnalyticsService } from "./marketAnalytics";

import { TransactionAnalyticsService } from "./transactionAnalytics";
import { DeveloperAnalyticsService } from "./developerAnalytics";
import { LocalityAnalyticsService } from "./localityAnalytics";
import { ProjectAnalyticsService } from "./projectAnalytics";
import { MarketAnalyticsService } from "./marketAnalytics";

/** Single namespaced entry point, e.g. `AnalyticsService.Transaction.calculateMedianPrice(rows)`. */
export const AnalyticsService = {
  Transaction: TransactionAnalyticsService,
  Developer: DeveloperAnalyticsService,
  Locality: LocalityAnalyticsService,
  Project: ProjectAnalyticsService,
  Market: MarketAnalyticsService,
};
