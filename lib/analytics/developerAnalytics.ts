import type { ProjectStatus } from "@prisma/client";

/**
 * DeveloperAnalyticsService — the single source of truth for every
 * builder/developer-derived statistic: portfolio composition, years in
 * business, and the platform's own investment score.
 */

export const DELIVERED_STATUSES: ProjectStatus[] = ["DELIVERED", "READY_TO_MOVE"];
export const UNDER_CONSTRUCTION_STATUSES: ProjectStatus[] = ["UNDER_CONSTRUCTION", "NEARING_POSSESSION"];
export const UPCOMING_STATUSES: ProjectStatus[] = ["ANNOUNCED", "PRE_LAUNCH"];
export const ALL_PROJECT_STATUSES: ProjectStatus[] = [
  "ANNOUNCED",
  "PRE_LAUNCH",
  "UNDER_CONSTRUCTION",
  "NEARING_POSSESSION",
  "READY_TO_MOVE",
  "DELIVERED",
  "STALLED",
];

export interface DeveloperProjectRow {
  status: ProjectStatus;
  name: string;
  launchDate: Date | null;
  createdAt: Date;
  isFeatured: boolean;
  priceMinPaise: bigint | null;
  cityId: string;
}

export interface DeveloperPortfolioBreakdown {
  deliveredCount: number;
  underConstructionCount: number;
  upcomingCount: number;
  activeCount: number;
  latestLaunchName: string | null;
  featuredProjectName: string | null;
  startingPricePaise: number | null;
  cityCount: number;
}

export const DeveloperAnalyticsService = {
  /** Status split, portfolio breadth, starting price and featured project — shared by every developer-card query. */
  calculatePortfolioBreakdown(projects: DeveloperProjectRow[]): DeveloperPortfolioBreakdown {
    const deliveredCount = projects.filter((p) => DELIVERED_STATUSES.includes(p.status)).length;
    const underConstructionCount = projects.filter((p) => UNDER_CONSTRUCTION_STATUSES.includes(p.status)).length;
    const upcomingCount = projects.filter((p) => UPCOMING_STATUSES.includes(p.status)).length;
    const activeCount = projects.length - deliveredCount;
    const latest = [...projects].sort((a, b) => (b.launchDate ?? b.createdAt).getTime() - (a.launchDate ?? a.createdAt).getTime())[0];
    const featured = projects.find((p) => p.isFeatured) ?? latest;
    const startingPrices = projects.map((p) => p.priceMinPaise).filter((v): v is bigint => v !== null);
    const startingPricePaise = startingPrices.length > 0 ? Number(startingPrices.reduce((min, v) => (v < min ? v : min))) : null;
    const cityCount = new Set(projects.map((p) => p.cityId)).size;
    return {
      deliveredCount,
      underConstructionCount,
      upcomingCount,
      activeCount,
      latestLaunchName: latest?.name ?? null,
      featuredProjectName: featured?.name ?? null,
      startingPricePaise,
      cityCount,
    };
  },

  /** Count of published projects per status, non-zero buckets only, in canonical status order. */
  calculatePortfolioByStatus(projects: { status: ProjectStatus }[]): { status: ProjectStatus; count: number }[] {
    return ALL_PROJECT_STATUSES.map((status) => ({
      status,
      count: projects.filter((p) => p.status === status).length,
    })).filter((s) => s.count > 0);
  },

  calculateYearsInBusiness(foundedYear: number | null): number | null {
    if (foundedYear === null) return null;
    const years = new Date().getFullYear() - foundedYear;
    return years >= 0 ? years : null;
  },

  /**
   * Our own heuristic (not a copy of any third-party methodology): blends the
   * curated trust score, on-time delivery rate, and portfolio scale (log-scaled
   * so a handful of extra projects doesn't dominate) into a single 0-10 figure.
   */
  calculateInvestmentScore(overallScore: number | null, onTimeDeliveryPct: number | null, totalProjects: number): number | null {
    const parts: number[] = [];
    if (overallScore !== null) parts.push(overallScore);
    if (onTimeDeliveryPct !== null) parts.push(Math.min(10, onTimeDeliveryPct / 10));
    parts.push(Math.min(10, Math.log2(totalProjects + 1) * 3));
    if (parts.length === 0) return null;
    return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 10) / 10;
  },

  /** Plain-language narrative for the Developer Report's Market Summary section. */
  calculateMarketSummary(params: {
    builderName: string;
    totalProjects: number;
    deliveredCount: number;
    underConstructionCount: number;
    citiesServedCount: number;
    onTimeDeliveryPct: number | null;
  }): string {
    const { builderName, totalProjects, deliveredCount, underConstructionCount, citiesServedCount, onTimeDeliveryPct } = params;
    const parts: string[] = [];
    if (totalProjects > 0) {
      parts.push(`${builderName} has ${totalProjects} project${totalProjects === 1 ? "" : "s"} tracked across ${citiesServedCount} cit${citiesServedCount === 1 ? "y" : "ies"}`);
      parts.push(`${deliveredCount} delivered and ${underConstructionCount} currently under construction`);
    } else {
      parts.push(`${builderName} has no projects tracked yet`);
    }
    if (onTimeDeliveryPct !== null) {
      parts.push(`an on-time delivery record of ${onTimeDeliveryPct}%`);
    }
    return `${parts.join(", ")}.`;
  },
};
