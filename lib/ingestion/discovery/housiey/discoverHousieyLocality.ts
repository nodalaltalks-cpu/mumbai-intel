import { extractGenericProjectFacts } from "../generic/extractGenericFacts";
import { classifyGenericProjectStatus } from "../generic/classifyProjectStatus";
import { runWithConcurrency } from "../generic/runWithConcurrency";
import { fetchWithTimeout } from "../generic/fetchWithTimeout";
import type { CandidatePageResult } from "../generic/discoverDeveloperProjects";

/**
 * Phase 67 Part 14 — the smallest useful Housiey discovery adapter, per the
 * feasibility investigation's verdict: FEASIBLE (robots.txt allows a generic
 * crawler on `/in/` and `/projects/`, both plain server-rendered HTML, no
 * anti-bot signals). Housiey is a SECONDARY/VERIFIED_THIRD_PARTY discovery
 * source only — never treated as official, never auto-published, never
 * overwrites official-developer data — see decideCandidateFate's sourceType
 * param (Phase 67) and lib/actions/discovery.ts's runHousieyLocalityDiscovery
 * for how a STAGE outcome here actually reaches the founder review queue.
 *
 * Deliberately reuses the EXISTING generic-extraction pipeline unchanged
 * (extractGenericProjectFacts/classifyGenericProjectStatus/fetchWithTimeout/
 * runWithConcurrency) -- the only genuinely new logic here is Housiey's own
 * locality-page -> project-link pattern, which has no equivalent anywhere
 * else in the codebase (every other source is a developer's own sitemap).
 */

export const HOUSIEY_BASE_URL = "https://housiey.com";
export const HOUSIEY_FETCH_USER_AGENT = "Mozilla/5.0 (compatible; NoDalalTalksBot/1.0)";

/** Confirmed by the Phase 67 feasibility investigation: robots.txt disallows `/project/` (singular) but NOT `/projects/` (plural, the real detail-page prefix) or `/in/` (locality hub pages). Never fetch outside these two confirmed-allowed prefixes. */
const HOUSIEY_PROJECT_LINK_PATTERN = /href="(\/projects\/[a-z0-9-]+)"/gi;

const DEFAULT_MAX_PROJECT_PAGES = 20;
const DEFAULT_PAGE_FETCH_CONCURRENCY = 3;

export interface HousieyLocalityDiscoveryResult {
  localitySlug: string;
  localityPageUrl: string;
  localityPageFetched: boolean;
  projectLinksFound: number;
  pagesFetched: number;
  pagesFailed: number;
  candidates: CandidatePageResult[];
}

/** Pure -- extracts every distinct `/projects/<slug>` link from a locality page's raw HTML, absolute-ized. Never follows a `/project/` (singular, robots-disallowed) or any other path shape. */
export function extractHousieyProjectLinks(html: string): string[] {
  const seen = new Set<string>();
  for (const match of html.matchAll(HOUSIEY_PROJECT_LINK_PATTERN)) {
    seen.add(`${HOUSIEY_BASE_URL}${match[1]}`);
  }
  return [...seen];
}

export interface DiscoverHousieyLocalityOptions {
  fetchImpl: typeof fetch;
  userAgent?: string;
  maxProjectPages?: number;
  pageFetchConcurrency?: number;
}

/**
 * Fetches ONE Housiey locality page (`/in/mumbai/<localitySlug>`), extracts
 * its real project links, and runs the existing generic extractor against a
 * bounded sample of them (Part 18: "do not import everything" -- this MVP
 * caps at 20 project pages per locality, matching the same "conservative
 * bounded sample" philosophy DEFAULT_MAX_PAGES_PER_DEVELOPER already uses
 * for developer-sitemap discovery). Never throws -- a fetch failure at any
 * step degrades toward `localityPageFetched: false` / an empty candidate
 * list rather than propagating, same failure-isolation contract as
 * discoverDeveloperProjects.
 */
export async function discoverHousieyLocalityProjects(
  localitySlug: string,
  opts: DiscoverHousieyLocalityOptions
): Promise<HousieyLocalityDiscoveryResult> {
  const userAgent = opts.userAgent ?? HOUSIEY_FETCH_USER_AGENT;
  const maxProjectPages = opts.maxProjectPages ?? DEFAULT_MAX_PROJECT_PAGES;
  const pageFetchConcurrency = opts.pageFetchConcurrency ?? DEFAULT_PAGE_FETCH_CONCURRENCY;
  const localityPageUrl = `${HOUSIEY_BASE_URL}/in/mumbai/${localitySlug}`;

  let localityHtml: string;
  try {
    const res = await fetchWithTimeout(opts.fetchImpl, localityPageUrl, { headers: { "User-Agent": userAgent } });
    if (!res.ok) {
      return { localitySlug, localityPageUrl, localityPageFetched: false, projectLinksFound: 0, pagesFetched: 0, pagesFailed: 0, candidates: [] };
    }
    localityHtml = await res.text();
  } catch {
    return { localitySlug, localityPageUrl, localityPageFetched: false, projectLinksFound: 0, pagesFetched: 0, pagesFailed: 0, candidates: [] };
  }

  const projectLinks = extractHousieyProjectLinks(localityHtml);
  const selected = projectLinks.slice(0, maxProjectPages);

  const fetchResults = await runWithConcurrency(selected, pageFetchConcurrency, async (url): Promise<CandidatePageResult> => {
    const res = await fetchWithTimeout(opts.fetchImpl, url, { headers: { "User-Agent": userAgent } });
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
      developerNameGuess: facts.developerNameGuess,
    };
  });

  let pagesFailed = 0;
  const candidates: CandidatePageResult[] = [];
  for (const r of fetchResults) {
    if (r.error || !r.result) {
      pagesFailed += 1;
      continue;
    }
    candidates.push(r.result);
  }

  return {
    localitySlug,
    localityPageUrl,
    localityPageFetched: true,
    projectLinksFound: projectLinks.length,
    pagesFetched: selected.length,
    pagesFailed,
    candidates,
  };
}
