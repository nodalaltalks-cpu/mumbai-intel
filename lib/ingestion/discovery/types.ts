import type { EnrichmentConfidence, SourceTier } from "../../enrichment/types";

/**
 * Phase 39 — the lightweight "project discovery candidate" concept, one
 * step BEFORE a real Project staging record. Deliberately reuses the
 * EXISTING IngestBatch/IngestStagingRecord tables (Part C) rather than a new
 * model: `entityType` is already a free string column nothing else branches
 * on except an explicit `=== "Project"`/`"Builder"`/etc. check (see
 * app/admin/.../data-sync/review/page.tsx and lib/actions/ingestion.ts), so
 * a brand-new value here is invisible to every existing entityType branch.
 * `status` is likewise already a free string column (its "PENDING | APPROVED
 * | REJECTED | ROLLED_BACK" comment documents ONE existing vocabulary, not a
 * DB-level constraint) — every existing query that reads it filters on a
 * specific value ("PENDING", "APPROVED", a specific batchId, or a specific
 * id), so this module's own distinct status vocabulary below can never be
 * picked up by the Review Queue, the Data Sync summary counts, or approval/
 * rollback logic. See lib/actions/discovery.ts's own doc comment for the
 * full verification trail.
 */
export const DISCOVERY_ENTITY_TYPE = "ProjectDiscoveryCandidate";

/** Part F's four-bucket duplicate taxonomy. EXACT/CLEAR_ALIAS both mean "this already exists" (never auto-merged, just labeled); AMBIGUOUS means a human must look; NO_MATCH means this is a genuinely new candidate. */
export type DiscoveryDuplicateStatus = "EXACT" | "CLEAR_ALIAS" | "AMBIGUOUS" | "NO_MATCH";

/** Part G: a project's official developer source is either confidently identified via the curated registry, or honestly unknown — never guessed. */
export type OfficialSourceStatus = "IDENTIFIED" | "OFFICIAL_SOURCE_UNKNOWN";

/** Part H's candidate lifecycle. ENRICHED is reserved for a future phase (once a candidate becomes a real Project staging record and is actually enriched) — nothing in this phase ever sets it. */
export type DiscoveryStatus =
  | "DISCOVERED"
  | "SOURCE_FOUND"
  | "READY_FOR_ENRICHMENT"
  | "ENRICHED"
  | "NEEDS_REVIEW"
  | "REJECTED_DUPLICATE"
  | "EXCLUDED";

export interface DiscoveryDuplicateMatch {
  existingId: string;
  existingName: string;
  confidence: number;
  reason: "rera_number" | "name_locality" | "compact_name_alias";
}

/**
 * The payload shape stored in IngestStagingRecord.payload for a discovery
 * candidate (entityType = DISCOVERY_ENTITY_TYPE). Deliberately NOT a
 * ProjectImportPayload — a candidate is pre-enrichment and pre-decision; it
 * only carries what Part C actually asked for, nothing a real Project needs
 * yet (no price/RERA/amenities/etc.). `duplicateStatus`/`officialSourceStatus`
 * are derived, human-readable labels (matching how EnrichmentField.
 * classification is already a derived label elsewhere) — matchedExistingId/
 * matchConfidence on the IngestStagingRecord row itself remain the source of
 * truth, using the exact same two columns every other entityType's
 * duplicate-match result already uses.
 */
export interface ProjectDiscoveryCandidatePayload {
  projectName: string;
  developerName: string;
  /** The area/locality text as actually discovered (e.g. "Hrushikesh, Lokhandwala, Andheri (W)") — may be more specific than the resolved Locality. */
  areaName: string;
  /** Part H: which batch this candidate belongs to, e.g. "Andheri West — Batch 001". */
  batchLabel: string;
  sourceUrl: string;
  /** Part E: the DISCOVERY source's own tier — reuses the existing SourceTier vocabulary (lib/enrichment/types.ts), never conflated with the tier of whatever source later enriches the project. */
  sourceType: SourceTier;
  /** Free-text description of where this candidate was found, e.g. "kalpataru.com sitemap.xml", "existing staged Project record". */
  discoverySource: string;
  officialDeveloperUrl: string | null;
  officialSourceStatus: OfficialSourceStatus;
  /** Confidence in the discovery itself (not any one field's value) — reuses the existing EnrichmentConfidence vocabulary. */
  confidence: EnrichmentConfidence;
  duplicateStatus: DiscoveryDuplicateStatus;
  duplicateMatch: DiscoveryDuplicateMatch | null;
}
