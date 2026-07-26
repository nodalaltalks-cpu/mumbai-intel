import type { Prisma } from "@prisma/client";

/**
 * TransactionAnalyticsService — the single source of truth for every
 * price/volume/count statistic derived from raw Transaction rows.
 *
 * These are pure functions: they take already-fetched rows and return
 * numbers. The DB fetch (the "repository" concern) stays in lib/queries.ts;
 * this module owns the "business logic" concern only, so no page or query
 * function ever computes a median/average/sum inline again.
 */

export interface TransactionPriceRow {
  valuePaise: bigint;
}

export interface TransactionStatsRow extends TransactionPriceRow {
  pricePerSqftPaise: bigint | null;
  carpetSqft: Prisma.Decimal | number | null;
}

export interface TransactionMonthlyRow extends TransactionPriceRow {
  registrationDate: Date;
  pricePerSqftPaise: bigint | null;
}

export interface TransactionStats {
  totalTransactions: number;
  medianPricePaise: number | null;
  avgPricePaise: number | null;
  avgPricePerSqftPaise: number | null;
  highestPricePaise: number | null;
  lowestPricePaise: number | null;
  avgUnitSizeSqft: number | null;
  totalSalesVolumePaise: number | null;
}

export interface TransactionMonthlyPoint {
  month: Date;
  count: number;
  avgPricePaise: number | null;
  medianPricePaise: number | null;
  avgPricePerSqftPaise: number | null;
  totalValuePaise: number;
}

export interface ConfigurationBucket {
  bedrooms: number;
  count: number;
}

export interface PropertyTypeBucket {
  category: string;
  count: number;
}

function sortedValues(rows: TransactionPriceRow[]): bigint[] {
  return rows.map((r) => r.valuePaise).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function medianOf(sorted: bigint[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Number(sorted[mid - 1] + sorted[mid]) / 2 : Number(sorted[mid]);
}

function sumOf(values: bigint[]): bigint {
  return values.reduce((acc, v) => acc + v, BigInt(0));
}

function averageOfNumbers(values: number[]): number | null {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export const TransactionAnalyticsService = {
  calculateTransactionCount(rows: TransactionPriceRow[]): number {
    return rows.length;
  },

  calculateMedianPrice(rows: TransactionPriceRow[]): number | null {
    return medianOf(sortedValues(rows));
  },

  calculateAveragePrice(rows: TransactionPriceRow[]): number | null {
    if (rows.length === 0) return null;
    return Number(sumOf(rows.map((r) => r.valuePaise))) / rows.length;
  },

  /** Alias kept for naming parity with the spec ("calculateAverageTransactionValue"). */
  calculateAverageTransactionValue(rows: TransactionPriceRow[]): number | null {
    return TransactionAnalyticsService.calculateAveragePrice(rows);
  },

  calculateHighestPrice(rows: TransactionPriceRow[]): number | null {
    const sorted = sortedValues(rows);
    return sorted.length > 0 ? Number(sorted[sorted.length - 1]) : null;
  },

  calculateLowestPrice(rows: TransactionPriceRow[]): number | null {
    const sorted = sortedValues(rows);
    return sorted.length > 0 ? Number(sorted[0]) : null;
  },

  calculateSalesVolume(rows: TransactionPriceRow[]): number | null {
    if (rows.length === 0) return null;
    return Number(sumOf(rows.map((r) => r.valuePaise)));
  },

  calculateAveragePricePerSqft(rows: { pricePerSqftPaise: bigint | null }[]): number | null {
    return averageOfNumbers(rows.map((r) => r.pricePerSqftPaise).filter((v): v is bigint => v !== null).map(Number));
  },

  calculateAverageUnitSize(rows: { carpetSqft: Prisma.Decimal | number | null }[]): number | null {
    return averageOfNumbers(rows.map((r) => r.carpetSqft).filter((v): v is Prisma.Decimal | number => v !== null).map(Number));
  },

  /** Composite stat block — the one function every "Market Snapshot" style panel should call. */
  calculateStats(rows: TransactionStatsRow[]): TransactionStats {
    return {
      totalTransactions: TransactionAnalyticsService.calculateTransactionCount(rows),
      medianPricePaise: TransactionAnalyticsService.calculateMedianPrice(rows),
      avgPricePaise: TransactionAnalyticsService.calculateAveragePrice(rows),
      avgPricePerSqftPaise: TransactionAnalyticsService.calculateAveragePricePerSqft(rows),
      highestPricePaise: TransactionAnalyticsService.calculateHighestPrice(rows),
      lowestPricePaise: TransactionAnalyticsService.calculateLowestPrice(rows),
      avgUnitSizeSqft: TransactionAnalyticsService.calculateAverageUnitSize(rows),
      totalSalesVolumePaise: TransactionAnalyticsService.calculateSalesVolume(rows),
    };
  },

  /** Buckets rows by calendar month and computes the same stat set per bucket. */
  calculateMonthlyTrend(rows: TransactionMonthlyRow[]): TransactionMonthlyPoint[] {
    const byMonth = new Map<string, { month: Date; rows: TransactionMonthlyRow[] }>();
    for (const row of rows) {
      const key = row.registrationDate.toISOString().slice(0, 7);
      const bucket = byMonth.get(key) ?? { month: new Date(row.registrationDate.getFullYear(), row.registrationDate.getMonth(), 1), rows: [] };
      bucket.rows.push(row);
      byMonth.set(key, bucket);
    }

    return Array.from(byMonth.values())
      .sort((a, b) => a.month.getTime() - b.month.getTime())
      .map((bucket) => ({
        month: bucket.month,
        count: bucket.rows.length,
        avgPricePaise: TransactionAnalyticsService.calculateAveragePrice(bucket.rows),
        medianPricePaise: TransactionAnalyticsService.calculateMedianPrice(bucket.rows),
        avgPricePerSqftPaise: TransactionAnalyticsService.calculateAveragePricePerSqft(bucket.rows),
        totalValuePaise: TransactionAnalyticsService.calculateSalesVolume(bucket.rows) ?? 0,
      }));
  },

  calculateConfigurationDistribution(rows: { bedrooms: Prisma.Decimal | number }[]): ConfigurationBucket[] {
    const counts = new Map<number, number>();
    for (const row of rows) {
      const bedrooms = Number(row.bedrooms);
      counts.set(bedrooms, (counts.get(bedrooms) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([bedrooms, count]) => ({ bedrooms, count }))
      .sort((a, b) => b.count - a.count);
  },

  calculatePropertyTypeDistribution(rows: { category: string | null }[]): PropertyTypeBucket[] {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const category = row.category ?? "UNSPECIFIED";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  },
};
