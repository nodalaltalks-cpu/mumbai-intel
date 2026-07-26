import type { Prisma } from "@prisma/client";

/**
 * ProjectAnalyticsService — the single source of truth for every
 * project-derived statistic: the configuration/price summary shown on every
 * card, and the platform's own project-level investment score.
 */

export interface ConfigurationForCard {
  bedrooms: Prisma.Decimal | number;
  carpetSqft: Prisma.Decimal | number | null;
  priceMinPaise: bigint | null;
}

export interface ProjectCardFields {
  configurationSummary: string | null;
  pricePerSqftPaise: number | null;
}

export const ProjectAnalyticsService = {
  /** "2, 3 BHK" summary — the distinct bedroom counts across a project's configurations. */
  calculateConfigurationSummary(configurations: ConfigurationForCard[]): string | null {
    if (configurations.length === 0) return null;
    const bedroomCounts = Array.from(new Set(configurations.map((c) => Number(c.bedrooms)))).sort((a, b) => a - b);
    return `${bedroomCounts.map((n) => (Number.isInteger(n) ? n : n.toFixed(1))).join(", ")} BHK`;
  },

  /** Approximate blended ₹/sqft from each configuration's own min price ÷ carpet area. */
  calculatePricePerSqft(configurations: ConfigurationForCard[]): number | null {
    const ratios = configurations
      .filter((c) => c.carpetSqft !== null && c.priceMinPaise !== null && Number(c.carpetSqft) > 0)
      .map((c) => Number(c.priceMinPaise) / Number(c.carpetSqft));
    return ratios.length > 0 ? Math.round(ratios.reduce((a, b) => a + b, 0) / ratios.length) : null;
  },

  /** Composite — the one call every project-card query should make. */
  calculateCardFields(configurations: ConfigurationForCard[]): ProjectCardFields {
    return {
      configurationSummary: ProjectAnalyticsService.calculateConfigurationSummary(configurations),
      pricePerSqftPaise: ProjectAnalyticsService.calculatePricePerSqft(configurations),
    };
  },

  /**
   * Our own heuristic (not a copy of any third-party methodology): blends the
   * locality's investment score, the builder's trust score, and this
   * project's own recent transaction velocity (log-scaled) into a 0-10 figure.
   */
  calculateInvestmentScore(localityInvestmentScore: number | null, builderOverallScore: number | null, totalTransactions: number): number | null {
    const parts: number[] = [];
    if (localityInvestmentScore !== null) parts.push(localityInvestmentScore);
    if (builderOverallScore !== null) parts.push(builderOverallScore);
    parts.push(Math.min(10, Math.log2(totalTransactions + 1) * 3));
    if (parts.length === 0) return null;
    return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 10) / 10;
  },

  /** Plain-language narrative for the Project Report's Market Summary section. */
  calculateMarketSummary(params: {
    projectName: string;
    localityName: string;
    statusLabel: string;
    totalTransactions: number;
    investmentScore: number | null;
  }): string {
    const { projectName, localityName, statusLabel, totalTransactions, investmentScore } = params;
    const parts: string[] = [`${projectName} in ${localityName} is currently ${statusLabel.toLowerCase()}`];
    if (totalTransactions > 0) {
      parts.push(`with ${totalTransactions} registered transaction${totalTransactions === 1 ? "" : "s"} tracked`);
    } else {
      parts.push("with no registered transactions tracked yet");
    }
    if (investmentScore !== null) {
      parts.push(`giving it an investment score of ${investmentScore.toFixed(1)}/10`);
    }
    return `${parts.join(", ")}.`;
  },
};
