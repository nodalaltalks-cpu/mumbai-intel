import { resolveBuilderMatch } from "./resolveNamedEntity";
import type { ExistingBuilderCandidate } from "../ingestion/duplicateMatch";

/**
 * Phase 69 — the canonical developer website already lives on the existing
 * Builder model (`Builder.websiteUrl`), added long before this phase for the
 * public Builder profile. This module is the ONLY new logic needed to reuse
 * it for Discovery/enrichment's "Developer Website (A)" field: resolving a
 * free-text `developerName` (as Discovery/enrichment always carries it —
 * pre-Project candidates have no `builderId` FK yet) to that existing
 * Builder row, using the SAME exact-match discipline
 * lib/actions/discovery.ts's own Include-time builder resolution already
 * uses (resolveBuilderMatch, confidence-1 only — never a fuzzy guess, never
 * a new Builder created just to attach a website).
 */

export interface BuilderForWebsiteLookup extends ExistingBuilderCandidate {
  legalNames: string[];
  websiteUrl: string | null;
}

export interface SavedDeveloperWebsite {
  builderId: string;
  builderName: string;
  websiteUrl: string | null;
}

/**
 * EXACT (confidence-1) name/legalName match only — anything fuzzier is
 * genuinely ambiguous and is correctly reported as "no confirmed developer
 * record" here rather than risking one developer's saved website leaking
 * onto a different, merely-similarly-named developer (Requirement 5).
 */
export function resolveSavedDeveloperWebsite(developerName: string, builders: BuilderForWebsiteLookup[]): SavedDeveloperWebsite | null {
  const match = resolveBuilderMatch(builders, developerName);
  if (match.status !== "SINGLE_MATCH" || match.candidates[0].confidence !== 1) return null;
  const builder = builders.find((b) => b.id === match.candidates[0].id);
  if (!builder) return null;
  return { builderId: builder.id, builderName: builder.name, websiteUrl: builder.websiteUrl };
}

/**
 * Pure URL validation/normalization (Requirement 10) — valid http/https only,
 * trailing slash stripped consistently regardless of whether the founder
 * typed one (`new URL()` itself always appends "/" to a bare-origin URL, so
 * stripping afterwards makes "https://x.com" and "https://x.com/" converge
 * on the same stored value). Returns null for anything that doesn't parse as
 * a URL or uses a non-http(s) scheme (e.g. `javascript:`) — never thrown.
 */
export function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const stringified = url.toString().replace(/\/+$/, "");
  return stringified.length > 0 ? stringified : null;
}
