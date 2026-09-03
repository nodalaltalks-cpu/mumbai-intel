/**
 * Phase 60 Part 7 — exact (post-normalization) sourceUrl duplicate detection.
 * A genuine gap identified in the Phase 60 audit: the existing duplicate
 * matchers (lib/ingestion/duplicateMatch.ts's findPossibleDuplicateProject,
 * lib/ingestion/discovery/classifyDuplicate.ts) only ever compare project
 * NAME + locality (or an exact RERA number) — never the source URL itself.
 * Several real Phase 58 bad records (e.g. "Kalpataru Vian" vs "Kalpataru
 * Vian, Hrushikesh, Lokhandwala Andheri West") pointed at the byte-identical
 * developer page under two different scraped titles dissimilar enough that
 * name-based fuzzy matching alone would not have caught them.
 *
 * Deliberately narrow and conservative: this NEVER merges or deletes
 * anything (Phase 60 Section 7) — it only flags a DUPLICATE_URL signal for
 * the automation layer / founder to route to human review, reusing the same
 * "detect, never auto-resolve" discipline every other duplicate matcher in
 * this codebase already follows.
 */

/**
 * Normalizes a URL for comparison only — never used to rewrite a stored
 * value. Deliberately minimal: lowercases scheme+host only (paths CAN be
 * case-sensitive on real servers, so the path is left exactly as-is),
 * strips a trailing slash, strips the fragment, and strips a small,
 * well-known set of tracking parameters that carry no page-identity
 * information. Any other query parameter is preserved untouched — two URLs
 * differing in a non-tracking parameter (e.g. "?unit=A" vs "?unit=B") are
 * treated as genuinely different pages, never silently merged.
 */
const TRACKING_PARAMS = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "gclsrc"]);

export function normalizeSourceUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const protocol = url.protocol.toLowerCase();
  const path = url.pathname.replace(/\/+$/, "") || "/";

  const params = new URLSearchParams(url.search);
  for (const key of [...params.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) params.delete(key);
  }
  params.sort();
  const search = params.toString();

  return `${protocol}//${host}${path}${search ? `?${search}` : ""}`;
}

export interface SourceUrlCandidate {
  id: string;
  sourceUrl: string | null;
}

export interface SourceUrlDuplicateMatch {
  existingId: string;
  normalizedUrl: string;
}

/**
 * Flags an existing candidate/record whose sourceUrl normalizes to the SAME
 * URL as the one being checked. Returns the first match found (there should
 * only ever be one in practice) — null when candidateSourceUrl is missing,
 * unparseable, or genuinely unique among `existing`.
 */
export function findExactSourceUrlDuplicate(existing: SourceUrlCandidate[], candidateSourceUrl: string | null | undefined): SourceUrlDuplicateMatch | null {
  if (!candidateSourceUrl) return null;
  const normalizedCandidate = normalizeSourceUrl(candidateSourceUrl);
  if (!normalizedCandidate) return null;

  for (const record of existing) {
    if (!record.sourceUrl) continue;
    const normalizedExisting = normalizeSourceUrl(record.sourceUrl);
    if (normalizedExisting && normalizedExisting === normalizedCandidate) {
      return { existingId: record.id, normalizedUrl: normalizedCandidate };
    }
  }
  return null;
}
