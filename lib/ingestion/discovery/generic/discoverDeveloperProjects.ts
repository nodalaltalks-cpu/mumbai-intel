import type { EnrichmentConfidence } from "@/lib/enrichment/types";
import { fetchDeveloperUrlUniverse } from "./robotsAndSitemap";
import { classifyCandidateUrl } from "./projectUrlHeuristics";
import { extractGenericProjectFacts, type AreaEvidenceItem } from "./extractGenericFacts";
import { classifyGenericProjectStatus, type GenericStatusBucket } from "./classifyProjectStatus";
import { runWithConcurrency } from "./runWithConcurrency";

/** Part L: conservative defaults — a developer's sitemap can list hundreds of URLs; this MVP fetches a bounded sample, never the whole thing. */
export const DEFAULT_MAX_PAGES_PER_DEVELOPER = 40;
export const DEFAULT_PAGE_FETCH_CONCURRENCY = 3;

export interface CandidatePageResult {
  url: string;
  projectNameGuess: string | null;
  /** Every locality-evidence tier found on the page, ranked most-confident first (Phase 56 Part A) — see decideCandidateFate.ts for how these are resolved against the real Locality table. */
  areaEvidence: AreaEvidenceItem[];
  reraNumber: string | null;
  statusBucket: GenericStatusBucket;
  statusEvidence: string;
  confidence: EnrichmentConfidence;
}

/** Part N's five-way developer classification. */
export type DeveloperGenericClassification = "GENERIC_SUCCESS" | "GENERIC_PARTIAL" | "CUSTOM_ADAPTER_REQUIRED" | "SOURCE_UNAVAILABLE" | "NO_CURRENT_PROJECTS";

export interface DeveloperGenericOutcomeMetrics {
  sourceUnavailable: boolean;
  candidateUrlsIdentified: number;
  sitemapPageUrlsFound: number;
  pagesFetched: number;
  usableCandidates: number;
  currentCandidates: number;
}

/**
 * Pure. Part N's "learn the actual economics of automation" bucket — a
 * deliberately simple, threshold-based rule so the same metrics always
 * produce the same label, never a subjective per-developer judgment call.
 */
export function classifyDeveloperGenericOutcome(m: DeveloperGenericOutcomeMetrics): DeveloperGenericClassification {
  if (m.sourceUnavailable) return "SOURCE_UNAVAILABLE";
  if (m.candidateUrlsIdentified === 0) {
    // A real sitemap with several page URLs but the URL-shape heuristic found
    // NOTHING plausible suggests the heuristic itself doesn't fit this
    // developer's URL conventions -- a real generic-mechanism gap, not "no
    // projects exist". A near-empty sitemap, by contrast, honestly means
    // there's nothing current to find.
    return m.sitemapPageUrlsFound > 5 ? "CUSTOM_ADAPTER_REQUIRED" : "NO_CURRENT_PROJECTS";
  }
  if (m.pagesFetched === 0) return "SOURCE_UNAVAILABLE";

  const successRate = m.usableCandidates / m.pagesFetched;
  if (successRate === 0) return "CUSTOM_ADAPTER_REQUIRED";
  if (m.currentCandidates === 0) return "NO_CURRENT_PROJECTS";
  return successRate >= 0.7 ? "GENERIC_SUCCESS" : "GENERIC_PARTIAL";
}

export interface DeveloperDiscoveryResult {
  developerName: string;
  domain: string;
  robotsFetched: boolean;
  disallowsEverythingForAllAgents: boolean;
  sitemapsFetched: number;
  sitemapsFailed: number;
  sitemapPageUrlsFound: number;
  candidateUrlsIdentified: number;
  pagesFetched: number;
  pagesFailed: number;
  candidates: CandidatePageResult[];
  classification: DeveloperGenericClassification;
  durationMs: number;
}

export interface DiscoverDeveloperProjectsOptions {
  fetchImpl: typeof fetch;
  userAgent: string;
  maxPagesToFetch?: number;
  pageFetchConcurrency?: number;
}

/**
 * Part C/D/L — the generic (developer-agnostic) discovery orchestrator for
 * ONE developer: robots+sitemap -> URL-shape filter -> bounded-concurrency
 * page fetch -> generic fact extraction -> status classification. Never
 * throws (Part P "failure isolation") — any failure at any step degrades the
 * result toward SOURCE_UNAVAILABLE/CUSTOM_ADAPTER_REQUIRED rather than
 * propagating. Does NOT touch the database and does NOT resolve Mumbai
 * localities — this is pure discovery; a separate step (buildStagingBatch.ts)
 * combines this output with the EXISTING locality-resolution and duplicate-
 * protection machinery.
 */
export async function discoverDeveloperProjects(
  developerName: string,
  domain: string,
  opts: DiscoverDeveloperProjectsOptions
): Promise<DeveloperDiscoveryResult> {
  const start = Date.now();
  const maxPages = opts.maxPagesToFetch ?? DEFAULT_MAX_PAGES_PER_DEVELOPER;
  const pageConcurrency = opts.pageFetchConcurrency ?? DEFAULT_PAGE_FETCH_CONCURRENCY;

  const universe = await fetchDeveloperUrlUniverse(domain, opts.fetchImpl, opts.userAgent);
  const sourceUnavailable = universe.disallowsEverythingForAllAgents || (universe.sitemapsFetched.length === 0 && universe.pageUrls.length === 0);

  if (sourceUnavailable) {
    return {
      developerName,
      domain,
      robotsFetched: universe.robotsFetched,
      disallowsEverythingForAllAgents: universe.disallowsEverythingForAllAgents,
      sitemapsFetched: universe.sitemapsFetched.length,
      sitemapsFailed: universe.sitemapsFailed.length,
      sitemapPageUrlsFound: universe.pageUrls.length,
      candidateUrlsIdentified: 0,
      pagesFetched: 0,
      pagesFailed: 0,
      candidates: [],
      classification: "SOURCE_UNAVAILABLE",
      durationMs: Date.now() - start,
    };
  }

  const candidateUrls = universe.pageUrls.filter((u) => classifyCandidateUrl(u).likely);
  const selected = candidateUrls.slice(0, maxPages);

  let pagesFailed = 0;
  const fetchResults = await runWithConcurrency(selected, pageConcurrency, async (url): Promise<CandidatePageResult | null> => {
    const res = await opts.fetchImpl(url, { headers: { "User-Agent": opts.userAgent } });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    const html = await res.text();
    const facts = extractGenericProjectFacts(html, url);
    const statusResult = classifyGenericProjectStatus(facts.statusEvidenceText, Boolean(facts.projectNameGuess));
    return {
      url,
      projectNameGuess: facts.projectNameGuess,
      areaEvidence: facts.areaEvidence,
      reraNumber: facts.reraNumber,
      statusBucket: statusResult.bucket,
      statusEvidence: statusResult.evidence,
      confidence: facts.confidence,
    };
  });

  const candidates: CandidatePageResult[] = [];
  for (const r of fetchResults) {
    if (r.error || !r.result) {
      pagesFailed += 1;
      continue;
    }
    candidates.push(r.result);
  }

  const usableCandidates = candidates.filter((c) => c.confidence !== "Low" && c.projectNameGuess).length;
  const currentCandidates = candidates.filter((c) => c.statusBucket === "CURRENT" && c.confidence !== "Low" && c.projectNameGuess).length;

  const classification = classifyDeveloperGenericOutcome({
    sourceUnavailable: false,
    candidateUrlsIdentified: candidateUrls.length,
    sitemapPageUrlsFound: universe.pageUrls.length,
    pagesFetched: selected.length,
    usableCandidates,
    currentCandidates,
  });

  return {
    developerName,
    domain,
    robotsFetched: universe.robotsFetched,
    disallowsEverythingForAllAgents: universe.disallowsEverythingForAllAgents,
    sitemapsFetched: universe.sitemapsFetched.length,
    sitemapsFailed: universe.sitemapsFailed.length,
    sitemapPageUrlsFound: universe.pageUrls.length,
    candidateUrlsIdentified: candidateUrls.length,
    pagesFetched: selected.length,
    pagesFailed,
    candidates,
    classification,
    durationMs: Date.now() - start,
  };
}
