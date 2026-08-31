import type { EnrichmentConfidence, SourceTier } from "../../enrichment/types";
import type { ExistingProjectCandidate } from "../duplicateMatch";
import { classifyDiscoveryDuplicate } from "./classifyDuplicate";
import { identifyOfficialSource } from "./officialSource";
import type { DiscoveryStatus, ProjectDiscoveryCandidatePayload } from "./types";

export interface DiscoveryCandidateInput {
  projectName: string;
  developerName: string;
  areaName: string;
  /** The existing Locality this candidate belongs to — Part A fixes the target area, so every candidate in one discovery run already resolves to the same known Locality (Phase 33's resolveLocalityMatch handles the general case; a single-area batch doesn't need it per candidate). */
  localityId: string;
  batchLabel: string;
  sourceUrl: string;
  sourceType: SourceTier;
  discoverySource: string;
  confidence: EnrichmentConfidence;
  reraNumber?: string;
}

export interface BuiltDiscoveryCandidate {
  payload: ProjectDiscoveryCandidatePayload;
  status: DiscoveryStatus;
  matchedExistingId: string | null;
  matchConfidence: number | null;
}

/**
 * Part H's initial (system-assigned) status. Founder actions
 * (statusTransitions.ts) take over from here — this function only computes
 * where a BRAND NEW candidate starts out, from the two signals that are
 * knowable immediately: duplicate status and official-source status.
 */
export function computeInitialDiscoveryStatus(
  duplicateStatus: ProjectDiscoveryCandidatePayload["duplicateStatus"],
  officialSourceStatus: ProjectDiscoveryCandidatePayload["officialSourceStatus"]
): DiscoveryStatus {
  if (duplicateStatus === "AMBIGUOUS") return "NEEDS_REVIEW";
  if (duplicateStatus === "EXACT" || duplicateStatus === "CLEAR_ALIAS") return "REJECTED_DUPLICATE";
  return officialSourceStatus === "IDENTIFIED" ? "SOURCE_FOUND" : "DISCOVERED";
}

/**
 * Assembles one discovery candidate: runs the reused duplicate matcher
 * (classifyDiscoveryDuplicate) and the reused official-domain lookup
 * (identifyOfficialSource), then computes its initial status. Pure — no I/O,
 * no database access — so every real research decision this phase makes is
 * unit-testable without touching Prisma. The caller (lib/actions/discovery.ts)
 * is the only place that turns this into an actual IngestStagingRecord row.
 */
export function buildDiscoveryCandidate(input: DiscoveryCandidateInput, existingProjects: ExistingProjectCandidate[]): BuiltDiscoveryCandidate {
  const { duplicateStatus, match } = classifyDiscoveryDuplicate(existingProjects, {
    name: input.projectName,
    localityId: input.localityId,
    reraNumber: input.reraNumber,
  });
  const officialSource = identifyOfficialSource(input.developerName);
  const status = computeInitialDiscoveryStatus(duplicateStatus, officialSource.status);

  const payload: ProjectDiscoveryCandidatePayload = {
    projectName: input.projectName,
    developerName: input.developerName,
    areaName: input.areaName,
    batchLabel: input.batchLabel,
    sourceUrl: input.sourceUrl,
    sourceType: input.sourceType,
    discoverySource: input.discoverySource,
    officialDeveloperUrl: officialSource.officialDeveloperUrl,
    officialSourceStatus: officialSource.status,
    confidence: input.confidence,
    duplicateStatus,
    duplicateMatch: match,
  };

  return { payload, status, matchedExistingId: match?.existingId ?? null, matchConfidence: match?.confidence ?? null };
}
