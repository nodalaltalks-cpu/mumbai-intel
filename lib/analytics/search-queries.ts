import "server-only";
import type { ResearchEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildBuckets, countByBucket, type AnalyticsPeriod } from "./period";

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
