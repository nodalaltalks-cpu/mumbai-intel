/**
 * MarketAnalyticsService — generic, reusable ranking utilities used to build
 * every "Top X" / "Trending X" / "Newest X" list on the platform. Keeping
 * this logic here (rather than a bespoke `.sort()` inline in each query)
 * means every ranking rule is defined once and named, not re-invented.
 */
export const MarketAnalyticsService = {
  rankByScoreDesc<T>(items: T[], scoreOf: (item: T) => number | null, limit?: number): T[] {
    const ranked = [...items].sort((a, b) => (scoreOf(b) ?? -Infinity) - (scoreOf(a) ?? -Infinity));
    return limit !== undefined ? ranked.slice(0, limit) : ranked;
  },

  rankByCountDesc<T>(items: T[], countOf: (item: T) => number, limit?: number): T[] {
    const ranked = [...items].sort((a, b) => countOf(b) - countOf(a));
    return limit !== undefined ? ranked.slice(0, limit) : ranked;
  },

  rankByDateDesc<T>(items: T[], dateOf: (item: T) => Date | null, limit?: number): T[] {
    const ranked = [...items].sort((a, b) => (dateOf(b)?.getTime() ?? -Infinity) - (dateOf(a)?.getTime() ?? -Infinity));
    return limit !== undefined ? ranked.slice(0, limit) : ranked;
  },

  /** YoY-style growth percentage between a prior and current value. Also the general-purpose "vs baseline" comparator used by every Report's Comparisons section (baseline as `previousValue`, entity's own figure as `currentValue`). */
  calculateGrowthPercent(previousValue: number, currentValue: number): number | null {
    if (previousValue === 0) return currentValue > 0 ? null : 0;
    return Math.round(((currentValue - previousValue) / previousValue) * 1000) / 10;
  },

  /** Simple mean, rounded to 1 decimal — the one place any report/query averages a list of scores. */
  calculateAverage(values: number[]): number | null {
    return values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
  },

  /**
   * City/market-wide narrative for the Market Report and Transaction Report —
   * mirrors LocalityAnalyticsService.calculateMarketSummary's plain-language style.
   */
  calculateMarketSummary(params: {
    scopeName: string;
    liveProjectsCount: number;
    localitiesCount: number;
    buildersCount: number;
    transactionsCount: number;
    transactions90dCount: number;
    growthPercentYoy: number | null;
  }): string {
    const { scopeName, liveProjectsCount, localitiesCount, buildersCount, transactionsCount, transactions90dCount, growthPercentYoy } = params;
    const parts: string[] = [];
    parts.push(`${scopeName} tracks ${liveProjectsCount} live project${liveProjectsCount === 1 ? "" : "s"} across ${localitiesCount} localit${localitiesCount === 1 ? "y" : "ies"} from ${buildersCount} builder${buildersCount === 1 ? "" : "s"}`);
    if (transactionsCount > 0) {
      parts.push(`${transactionsCount} transaction${transactionsCount === 1 ? "" : "s"} recorded overall, ${transactions90dCount} in the last 90 days`);
    } else {
      parts.push("no transactions recorded yet");
    }
    if (growthPercentYoy !== null) {
      parts.push(`average price is trending ${growthPercentYoy >= 0 ? "up" : "down"} ${Math.abs(growthPercentYoy).toFixed(1)}% year-over-year`);
    }
    return `${parts.join(", ")}.`;
  },
};
