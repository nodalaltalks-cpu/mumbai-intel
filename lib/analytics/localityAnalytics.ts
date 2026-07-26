import type { ProjectStatus } from "@prisma/client";

/**
 * LocalityAnalyticsService — the single source of truth for every
 * locality-derived market indicator: demand, supply, investment score and
 * the plain-language market summary shown on Area Intelligence pages.
 */

export type DemandLabel = "Rising" | "Stable" | "Cooling" | "Insufficient data";
export type SupplyLabel = "High" | "Moderate" | "Low" | "Insufficient data";

export interface LocalityIntelligence {
  demandScore: number | null;
  demandLabel: DemandLabel;
  supplyScore: number | null;
  supplyLabel: SupplyLabel;
  investmentScore: number | null;
  investmentIsCurated: boolean;
  summary: string;
}

export const LocalityAnalyticsService = {
  /** Rental yield is admin-curated today; centralized here so a future derived
   *  calculation (e.g. from transaction + rental listing data) has one place to live. */
  calculateRentalYield(curatedRentalYieldPercent: number | null): number | null {
    return curatedRentalYieldPercent;
  },

  calculateDemandIndicator(recentTransactionCount: number, priorTransactionCount: number): { score: number | null; label: DemandLabel } {
    if (recentTransactionCount === 0 && priorTransactionCount === 0) return { score: null, label: "Insufficient data" };
    const ratio = priorTransactionCount === 0 ? (recentTransactionCount > 0 ? 2 : 1) : recentTransactionCount / priorTransactionCount;
    const score = Math.max(0, Math.min(10, Math.round((Math.min(ratio, 2) / 2) * 10)));
    const label: DemandLabel = ratio > 1.15 ? "Rising" : ratio < 0.85 ? "Cooling" : "Stable";
    return { score, label };
  },

  calculateSupplyIndicator(projectStatuses: ProjectStatus[]): { score: number | null; label: SupplyLabel } {
    if (projectStatuses.length === 0) return { score: null, label: "Insufficient data" };
    const activeCount = projectStatuses.filter((s) => s !== "DELIVERED" && s !== "READY_TO_MOVE").length;
    const activeShare = activeCount / projectStatuses.length;
    const score = Math.round(activeShare * 10);
    const label: SupplyLabel = activeShare > 0.6 ? "High" : activeShare > 0.3 ? "Moderate" : "Low";
    return { score, label };
  },

  /**
   * Our own heuristic, not a copy of any third-party methodology: uses the
   * admin-curated score when set; otherwise a transparent blend of rental
   * yield, YoY growth and demand.
   */
  calculateInvestmentScore(
    curatedInvestmentScore: number | null,
    rentalYieldPercent: number | null,
    growthPercentYoy: number | null,
    demandScore: number | null
  ): { score: number | null; isCurated: boolean } {
    if (curatedInvestmentScore !== null) return { score: curatedInvestmentScore, isCurated: true };
    const parts = [
      rentalYieldPercent !== null ? Math.min(10, (rentalYieldPercent / 5) * 10) : null,
      growthPercentYoy !== null ? Math.min(10, Math.max(0, (growthPercentYoy / 15) * 10)) : null,
      demandScore,
    ].filter((v): v is number => v !== null);
    const score = parts.length > 0 ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 10) / 10 : null;
    return { score, isCurated: false };
  },

  calculateMarketSummary(params: {
    localityName: string;
    recentTransactionCount: number;
    demandLabel: DemandLabel;
    publishedProjectCount: number;
    supplyLabel: SupplyLabel;
    investmentScore: number | null;
    investmentIsCurated: boolean;
  }): string {
    const { localityName, recentTransactionCount, demandLabel, publishedProjectCount, supplyLabel, investmentScore, investmentIsCurated } = params;
    const parts: string[] = [];
    if (recentTransactionCount > 0) {
      parts.push(`${localityName} recorded ${recentTransactionCount} transaction${recentTransactionCount === 1 ? "" : "s"} in the last 3 months`);
      parts.push(`with demand trending ${demandLabel.toLowerCase()} against the prior quarter`);
    } else {
      parts.push(`${localityName} has no recorded transactions in the last 3 months`);
    }
    if (publishedProjectCount > 0) {
      parts.push(`supply is ${supplyLabel.toLowerCase()} with ${publishedProjectCount} published project${publishedProjectCount === 1 ? "" : "s"} tracked`);
    }
    if (investmentScore !== null) {
      parts.push(`giving an investment score of ${investmentScore.toFixed(1)}/10${investmentIsCurated ? " (analyst-curated)" : " (computed)"}`);
    }
    return parts.length > 0 ? `${parts.join(", ")}.` : "Not enough data yet to summarize this market.";
  },

  /** Composite — combines all of the above into the full LocalityIntelligence panel. */
  calculateIntelligence(params: {
    localityName: string;
    recentTransactionCount: number;
    priorTransactionCount: number;
    projectStatuses: ProjectStatus[];
    curatedInvestmentScore: number | null;
    rentalYieldPercent: number | null;
    growthPercentYoy: number | null;
  }): LocalityIntelligence {
    const demand = LocalityAnalyticsService.calculateDemandIndicator(params.recentTransactionCount, params.priorTransactionCount);
    const supply = LocalityAnalyticsService.calculateSupplyIndicator(params.projectStatuses);
    const investment = LocalityAnalyticsService.calculateInvestmentScore(
      params.curatedInvestmentScore,
      params.rentalYieldPercent,
      params.growthPercentYoy,
      demand.score
    );
    const summary = LocalityAnalyticsService.calculateMarketSummary({
      localityName: params.localityName,
      recentTransactionCount: params.recentTransactionCount,
      demandLabel: demand.label,
      publishedProjectCount: params.projectStatuses.length,
      supplyLabel: supply.label,
      investmentScore: investment.score,
      investmentIsCurated: investment.isCurated,
    });
    return {
      demandScore: demand.score,
      demandLabel: demand.label,
      supplyScore: supply.score,
      supplyLabel: supply.label,
      investmentScore: investment.score,
      investmentIsCurated: investment.isCurated,
      summary,
    };
  },
};
