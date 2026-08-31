import type { ProjectImportPayload } from "../connectors/fileImport/types";
import type { ExistingProjectCandidate } from "../duplicateMatch";
import type { ProjectDiscoveryCandidatePayload } from "./types";

/** A pending "Project"-entityType staging record, reshaped into the same {id,name,localityId,reraNumber} shape findPossibleDuplicateProject already expects for a live Project row — Phase 40's own small addition on top of the EXISTING matcher (Part E), mirroring transactionFileImportRunner.ts's own precedent of also checking still-pending staging records, not just the live table. Never queries the database itself — the caller fetches the rows. */
export function pendingProjectStagingAsExistingCandidates(
  records: { id: string; payload: ProjectImportPayload }[]
): ExistingProjectCandidate[] {
  return records.map((r) => ({ id: r.id, name: r.payload.name, localityId: r.payload.localityId, reraNumber: r.payload.reraNumber ?? null }));
}

/**
 * Phase 41 Part I — an existing "ProjectDiscoveryCandidate" staging row
 * (from THIS or an earlier discovery batch), reshaped into the same
 * ExistingProjectCandidate shape so a bulk discovery run never stages a
 * second candidate for a project already sitting in the Discovery Queue.
 * Same reuse discipline as pendingProjectStagingAsExistingCandidates above —
 * no new matching algorithm, just one more data source fed into the EXISTING
 * findPossibleDuplicateProject/classifyDiscoveryDuplicate machinery. A
 * discovery candidate payload never carries a RERA number (an already-
 * documented Phase 40 limitation), so `reraNumber` is always null here —
 * matching still resolves on name+locality, exactly as it does for the
 * "Godrej Sky Shore" vs "Godrej Skyshore" worked example.
 */
export function existingDiscoveryCandidatesAsExistingCandidates(
  records: { id: string; payload: ProjectDiscoveryCandidatePayload }[],
  localityId: string
): ExistingProjectCandidate[] {
  return records.map((r) => ({ id: r.id, name: r.payload.projectName, localityId, reraNumber: null }));
}

/**
 * Phase 40 Part D — maps a discovery candidate's payload into the EXISTING
 * ProjectImportPayload shape, populating ONLY what is genuinely known.
 * `status`/`category` are the two required enum fields a fresh discovery
 * candidate cannot yet honestly claim (price/possession/construction-stage
 * facts are exactly what enrichment exists to discover next) — rather than
 * fabricate a specific stage, this uses the most minimal, literally-true
 * values available: "ANNOUNCED" (a discovered project has, by definition,
 * been announced somewhere — no claim about construction progress) and
 * "RESIDENTIAL" (every candidate in this discovery pipeline to date is a
 * residential project, matching Mumbai Intel's own catalogue focus — not a
 * per-project guess). Both are immediately correctable via the normal
 * Project edit form once staged, exactly like any other newly-discovered
 * project. No price/RERA/possession/address/coordinates/builder are ever
 * invented — a genuinely unknown value is simply omitted (the field stays
 * `undefined`, matching every other ProjectImportPayload producer in this
 * codebase).
 */
export function mapDiscoveryCandidateToProjectPayload(
  candidate: ProjectDiscoveryCandidatePayload,
  resolvedLocalityId: string,
  resolvedBuilderId: string | null,
  discoveryStagingRecordId: string
): ProjectImportPayload {
  return {
    name: candidate.projectName,
    status: "ANNOUNCED",
    category: "RESIDENTIAL",
    localityId: resolvedLocalityId,
    dataSource: "EXTERNAL_OPEN_DATA",
    sourceRef: `discovery:${discoveryStagingRecordId}`,
    builderId: resolvedBuilderId ?? undefined,
    // Only carried as free text when no existing Builder row was confidently
    // resolved -- exactly the same convention runProjectFileImport already
    // uses (`developerGroup: !builderId ? row.builderName : undefined`).
    developerGroup: resolvedBuilderId ? undefined : candidate.developerName,
  };
}
