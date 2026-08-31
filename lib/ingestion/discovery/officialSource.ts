import { resolveDeveloperDomain } from "../../enrichment/developerDomainRegistry";
import type { OfficialSourceStatus } from "./types";

export interface OfficialSourceResult {
  status: OfficialSourceStatus;
  officialDeveloperUrl: string | null;
}

/**
 * Identifies a discovered project's official developer domain using ONLY the
 * existing curated, hand-verified registry (developerDomainRegistry.ts,
 * built up across Phases 28/31/38) — never guesses from the project or
 * developer name appearing inside a URL (Part G's explicit rule; the same
 * discipline Phase 15/16/38 already established against lookalike/lead-gen
 * domains like "-launch"/"-versova"/".homes"/"realtorprojects.com"). A
 * developer not yet in that curated list is honestly reported
 * OFFICIAL_SOURCE_UNKNOWN, never a best-guess domain — exactly Part G's
 * required behavior.
 */
export function identifyOfficialSource(developerName: string): OfficialSourceResult {
  const url = resolveDeveloperDomain(developerName);
  return url ? { status: "IDENTIFIED", officialDeveloperUrl: url } : { status: "OFFICIAL_SOURCE_UNKNOWN", officialDeveloperUrl: null };
}
