import "server-only";
import type { ResearchEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildBuckets, countByBucket, computeChange, type AnalyticsPeriod } from "./period";

/**
 * Founder-facing search-term analytics (Section 14) — reads the SEARCH_PERFORMED
 * (Projects) / TRANSACTION_SEARCHED (Transactions) rows that app/projects/page.tsx
 * and app/transactions/page.tsx already write to ResearchEvent on every `?q=`
 * request, metadata.query + resultCount. No new event pipeline: this is a read
 * path over data that was already being captured, just never surfaced to admin.
 * Query text lives in a JSON column, so (like every other JSON/array aggregation
 * in this codebase) rows are fetched once per period and grouped in JS rather
 * than via a DB-side groupBy.
 */

const SEARCH_EVENT_TYPES: ResearchEventType[] = ["SEARCH_PERFORMED", "TRANSACTION_SEARCHED"];

interface RawSearchRow {
  eventType: string;
  metadata: unknown;
  resultCount: number | null;
  createdAt: Date;
  publicUserId: string | null;
}

function queryOf(row: RawSearchRow): string | null {
  const q = (row.metadata as { query?: unknown } | null)?.query;
  return typeof q === "string" && q.trim() ? q.trim() : null;
}

async function fetchSearchRows(period: AnalyticsPeriod): Promise<RawSearchRow[]> {
  return prisma.researchEvent.findMany({
    where: { eventType: { in: SEARCH_EVENT_TYPES }, createdAt: { gte: period.since, lt: period.until } },
    select: { eventType: true, metadata: true, resultCount: true, createdAt: true, publicUserId: true },
    orderBy: { createdAt: "desc" },
  });
}

export interface SearchTermCount {
  query: string;
  count: number;
  context: "projects" | "transactions" | "both";
}

export async function getTopSearchTerms(period: AnalyticsPeriod, limit = 20): Promise<SearchTermCount[]> {
  const rows = await fetchSearchRows(period);
  const counts = new Map<string, { count: number; contexts: Set<"projects" | "transactions"> }>();
  for (const row of rows) {
    const query = queryOf(row);
    if (!query) continue;
    const key = query.toLowerCase();
    const entry = counts.get(key) ?? { count: 0, contexts: new Set() };
    entry.count += 1;
    entry.contexts.add(row.eventType === "SEARCH_PERFORMED" ? "projects" : "transactions");
    counts.set(key, entry);
  }
  return Array.from(counts.entries())
    .map(([query, v]) => ({
      query,
      count: v.count,
      context: v.contexts.size === 2 ? ("both" as const) : (Array.from(v.contexts)[0] ?? "projects"),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export interface RecentSearchRow {
  query: string;
  context: "projects" | "transactions";
  resultCount: number | null;
  createdAt: Date;
  isSignedIn: boolean;
}

export async function getRecentSearches(limit = 30): Promise<RecentSearchRow[]> {
  const rows = await prisma.researchEvent.findMany({
    where: { eventType: { in: SEARCH_EVENT_TYPES } },
    select: { eventType: true, metadata: true, resultCount: true, createdAt: true, publicUserId: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows
    .map((row) => ({ query: queryOf(row), row }))
    .filter((r): r is { query: string; row: (typeof rows)[number] } => r.query !== null)
    .map(({ query, row }) => ({
      query,
      context: row.eventType === "SEARCH_PERFORMED" ? ("projects" as const) : ("transactions" as const),
      resultCount: row.resultCount,
      createdAt: row.createdAt,
      isSignedIn: row.publicUserId !== null,
    }));
}

export async function getZeroResultSearches(period: AnalyticsPeriod, limit = 20): Promise<SearchTermCount[]> {
  const rows = await fetchSearchRows(period);
  const counts = new Map<string, { count: number; contexts: Set<"projects" | "transactions"> }>();
  for (const row of rows) {
    if (row.resultCount !== 0) continue;
    const query = queryOf(row);
    if (!query) continue;
    const key = query.toLowerCase();
    const entry = counts.get(key) ?? { count: 0, contexts: new Set() };
    entry.count += 1;
    entry.contexts.add(row.eventType === "SEARCH_PERFORMED" ? "projects" : "transactions");
    counts.set(key, entry);
  }
  return Array.from(counts.entries())
    .map(([query, v]) => ({
      query,
      count: v.count,
      context: v.contexts.size === 2 ? ("both" as const) : (Array.from(v.contexts)[0] ?? "projects"),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export interface SearchSummary {
  totalSearches: number;
  previousTotalSearches: number;
  zeroResultCount: number;
  uniqueTerms: number;
}

export async function getSearchSummary(period: AnalyticsPeriod): Promise<SearchSummary> {
  const [rows, previousCount] = await Promise.all([
    fetchSearchRows(period),
    prisma.researchEvent.count({
      where: { eventType: { in: SEARCH_EVENT_TYPES }, createdAt: { gte: period.previousSince, lt: period.previousUntil } },
    }),
  ]);
  const uniqueTerms = new Set(rows.map((r) => queryOf(r)?.toLowerCase()).filter(Boolean));
  return {
    totalSearches: rows.length,
    previousTotalSearches: previousCount,
    zeroResultCount: rows.filter((r) => r.resultCount === 0).length,
    uniqueTerms: uniqueTerms.size,
  };
}

export interface SearchTrendPoint {
  label: string;
  count: number;
}

export async function getSearchTrend(period: AnalyticsPeriod): Promise<SearchTrendPoint[]> {
  const rows = await fetchSearchRows(period);
  return countByBucket(
    rows.map((r) => r.createdAt),
    buildBuckets(period)
  );
}

/** Distinct signed-in searchers, not just search event count (Section 18: "Unique searchers" separate from "Total searches"). Anonymous sessions aren't counted -- same signed-in-only scope as getResearchFunnel. */
export async function getUniqueSearchers(period: AnalyticsPeriod): Promise<number> {
  const groups = await prisma.researchEvent.groupBy({
    by: ["publicUserId"],
    where: { eventType: { in: SEARCH_EVENT_TYPES }, publicUserId: { not: null }, createdAt: { gte: period.since, lt: period.until } },
  });
  return groups.length;
}

export interface TrendingSearchTerm {
  query: string;
  count: number;
  previousCount: number;
  percent: number | null;
  direction: "up" | "down" | "flat";
}

/** Section 20: trending searches with real %-change vs. the immediately preceding period of the same length (period.previousSince/previousUntil, the same comparison window every other page's stat cards use). Only terms that appeared in the current period are ranked; a term with zero previous occurrences shows as "up" with no percent (computeChange's existing null-when-no-baseline behavior). */
export async function getTrendingSearches(period: AnalyticsPeriod, limit = 10): Promise<TrendingSearchTerm[]> {
  const [currentRows, previousRows] = await Promise.all([
    fetchSearchRows(period),
    prisma.researchEvent.findMany({
      where: { eventType: { in: SEARCH_EVENT_TYPES }, createdAt: { gte: period.previousSince, lt: period.previousUntil } },
      select: { metadata: true },
    }),
  ]);

  const currentCounts = new Map<string, number>();
  for (const row of currentRows) {
    const q = queryOf(row);
    if (q) currentCounts.set(q.toLowerCase(), (currentCounts.get(q.toLowerCase()) ?? 0) + 1);
  }
  const previousCounts = new Map<string, number>();
  for (const row of previousRows) {
    const q = queryOf(row as RawSearchRow);
    if (q) previousCounts.set(q.toLowerCase(), (previousCounts.get(q.toLowerCase()) ?? 0) + 1);
  }

  return Array.from(currentCounts.entries())
    .map(([query, count]) => {
      const previousCount = previousCounts.get(query) ?? 0;
      const change = computeChange(count, previousCount);
      return { query, count, previousCount, percent: change.percent, direction: change.direction };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export interface SearchConversionRates {
  searchedUsers: number;
  viewedProjectRate: number | null;
  engagedRate: number | null;
  downloadedBrochureRate: number | null;
}

const VIEWED_PROJECT_EVENT_TYPES: ResearchEventType[] = ["PROJECT_VIEWED"];
const ENGAGED_EVENT_TYPES: ResearchEventType[] = ["COMPARE_USED", "WISHLIST_ADDED"];

/**
 * Search-to-X rates (Section 18) — a TRUE intersection (of the users who
 * searched, how many of those SAME users also viewed/engaged/downloaded),
 * not two independent counts compared against each other. An earlier
 * version divided getResearchFunnel's independent per-stage counts, which
 * produced nonsensical >100% rates in testing: "viewed a project" and
 * "searched" are tracked by different, non-overlapping event types
 * (browsing straight to a project page never fires a search event), so
 * nothing guaranteed the numerator was a subset of the denominator. Fixed
 * by first finding the actual set of searcher user ids, then counting how
 * many of exactly those ids also appear in the next stage. No per-search
 * "which result was clicked" is captured anywhere in this codebase, so this
 * is still an aggregate ("searched AND, at some point in the period, also
 * viewed"), not a literal per-search click trail — framed that way in the UI.
 */
export async function getSearchConversionRates(period: AnalyticsPeriod): Promise<SearchConversionRates> {
  const searcherGroups = await prisma.researchEvent.groupBy({
    by: ["publicUserId"],
    where: { eventType: { in: SEARCH_EVENT_TYPES }, publicUserId: { not: null }, createdAt: { gte: period.since, lt: period.until } },
  });
  const searcherIds = searcherGroups.map((g) => g.publicUserId as string);
  const searchedUsers = searcherIds.length;

  if (searchedUsers === 0) {
    return { searchedUsers: 0, viewedProjectRate: null, engagedRate: null, downloadedBrochureRate: null };
  }

  async function countIntersection(eventTypes: ResearchEventType[]): Promise<number> {
    const groups = await prisma.researchEvent.groupBy({
      by: ["publicUserId"],
      where: { eventType: { in: eventTypes }, publicUserId: { in: searcherIds }, createdAt: { gte: period.since, lt: period.until } },
    });
    return groups.length;
  }

  const [viewedProject, engaged, downloadedBrochure] = await Promise.all([
    countIntersection(VIEWED_PROJECT_EVENT_TYPES),
    countIntersection(ENGAGED_EVENT_TYPES),
    prisma.brochureDownloadEvent.groupBy({
      by: ["publicUserId"],
      where: { eventType: "DOWNLOAD_COMPLETED", publicUserId: { in: searcherIds }, createdAt: { gte: period.since, lt: period.until } },
    }),
  ]);

  const rate = (n: number) => Math.round((n / searchedUsers) * 1000) / 10;
  return {
    searchedUsers,
    viewedProjectRate: rate(viewedProject),
    engagedRate: rate(engaged),
    downloadedBrochureRate: rate(downloadedBrochure.length),
  };
}

export type SearchIntent = "PROJECT" | "BUILDER" | "LOCALITY" | "PRICE" | "TRANSACTION" | "GENERAL";

const PRICE_TOKEN_PATTERN = /(?:₹|\brs\.?\b|\blakh|\bcrore|\bcr\b|\bbudget\b|\bunder\b|\bbelow\b|\bprice\b)/i;

/**
 * Deterministic search-intent classification (Section 21: "Do not use AI
 * classification if simple deterministic classification... is sufficient")
 * — matches the query text against the existing Locality/Builder/Project
 * name catalogs already in the database, plus a price-token pattern.
 * Callers pass in the catalogs (fetched once per page load) rather than
 * this function querying per call, to avoid N+1 lookups over a list of terms.
 */
export function classifySearchIntent(
  query: string,
  catalogs: { localityNames: string[]; builderNames: string[]; projectNames: string[] }
): SearchIntent {
  const q = query.trim().toLowerCase();
  if (!q) return "GENERAL";
  if (catalogs.projectNames.some((n) => n.toLowerCase().includes(q) || q.includes(n.toLowerCase()))) return "PROJECT";
  if (catalogs.builderNames.some((n) => n.toLowerCase().includes(q) || q.includes(n.toLowerCase()))) return "BUILDER";
  if (catalogs.localityNames.some((n) => n.toLowerCase().includes(q) || q.includes(n.toLowerCase()))) return "LOCALITY";
  if (PRICE_TOKEN_PATTERN.test(q)) return "PRICE";
  if (/transaction|registration|resale|deal/.test(q)) return "TRANSACTION";
  return "GENERAL";
}
