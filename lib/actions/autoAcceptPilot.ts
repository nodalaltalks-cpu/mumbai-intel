"use server";

import { requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { enrichProjectAction, acceptEnrichmentFieldAction } from "./enrichment";
import { decideFieldAutomation, type AutomationDecision } from "@/lib/enrichment/autoDecideFieldAutomation";
import { findExactSourceUrlDuplicate } from "@/lib/ingestion/discovery/sourceUrlDuplicate";
import { ENRICHMENT_HISTORY_ENTITY_TYPE } from "@/lib/enrichment/enrichmentHistory";
import { PILOT_PROJECTS, type PilotProject } from "@/lib/enrichment/pilotProjects";
import type { EnrichmentField } from "@/lib/enrichment/types";

/**
 * Phase 61 — the controlled auto-accept pilot orchestrator.
 *
 * Deliberately NOT a parallel acceptance system: every real write here goes
 * through the EXACT existing `acceptEnrichmentFieldAction` (same validation,
 * same AuditLog mechanism, same PENDING-only gate) that a founder's own
 * "Accept" click already uses. This file only decides WHICH fields are safe
 * enough to click on the founder's behalf (via `decideFieldAutomation`,
 * Phase 60, untouched) and supplies one small, additive audit event
 * afterward explaining WHY the automation made that call — see
 * `logMachineDecisionEvidence` below.
 *
 * Hardcoded to the exact 10 staging records manually reviewed in Phase 59B
 * (Phase 61's own explicit "DO NOT select a different set" instruction) —
 * never expanded, never parameterized, never exposed as a general
 * "run automation on X" entry point. Both exported functions require the
 * SAME `requireMutateSession()` every other enrichment action requires, so
 * an unauthenticated/unauthorized caller can invoke neither. The project
 * list itself (PILOT_PROJECTS) lives in lib/enrichment/pilotProjects.ts, not
 * here — a "use server" file can only export async Server Actions (the same
 * Phase 35 lesson bulkEnrichment.ts's own doc comment documents), never a
 * plain constant.
 */

export interface PilotFieldRow {
  stagingRecordId: string;
  projectName: string;
  field: string;
  currentValue: string | null;
  proposedValue: string | null;
  confidence: string | null;
  classification: EnrichmentField["classification"];
  tier: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
  decision: AutomationDecision;
  reason: string;
  /** True only when this decision represents a REAL new write (GREEN_NEW + AUTO_ACCEPT) — a CONFIRMED field is also "AUTO_ACCEPT" in Phase 60's vocabulary (nothing to do) but must never be counted or acted on as a write. */
  wouldWrite: boolean;
}

export interface DuplicateUrlWarning {
  stagingRecordId: string;
  projectName: string;
  duplicateOfStagingRecordId: string;
  duplicateOfProjectName: string;
  normalizedUrl: string;
}

export interface PilotDryRunResult {
  rows: PilotFieldRow[];
  duplicateUrlWarnings: DuplicateUrlWarning[];
}

/**
 * Runs the EXISTING `enrichProjectAction` (a real, already-shipped action —
 * the same one the "Enrich Project" button calls) for each of the 10 pilot
 * records, then interprets every returned field through Phase 60's
 * `decideFieldAutomation`. This DOES cause `enrichProjectAction`'s own
 * existing, pre-Phase-61 side effect (persisting the compact
 * `enrichmentSummary` badge) — that is not a new write path, it is the exact
 * same thing that already happens every time anyone clicks "Enrich Project"
 * in the existing UI, and it never touches any actual field value.
 *
 * Phase 61A — accepts an explicit `projects` list (defaulting to Phase 61's
 * own locked PILOT_PROJECTS everywhere it's already called with no
 * argument, so that behavior is byte-for-byte unchanged) rather than a
 * second, duplicate orchestrator function. This is the "smallest safe
 * integration adjustment" Phase 61A asks for when validating genuinely new
 * candidates outside the original 10 — never a parallel write path, never a
 * general "run on any project" surface (every exported function below still
 * requires the caller to name specific staging record ids up front; there is
 * no "run on everything" mode).
 */
async function computePilotRows(projects: PilotProject[]): Promise<PilotFieldRow[]> {
  const rows: PilotFieldRow[] = [];

  for (const project of projects) {
    const enrichResult = await enrichProjectAction(project.id);
    if (enrichResult.status === "ERROR" || enrichResult.status === "SOURCE_UNAVAILABLE" || enrichResult.status === "NO_SOURCE") {
      rows.push({
        stagingRecordId: project.id,
        projectName: project.name,
        field: "(enrichment)",
        currentValue: null,
        proposedValue: null,
        confidence: null,
        classification: "MISSING",
        tier: null,
        sourceType: null,
        sourceUrl: null,
        decision: "HUMAN_REVIEW",
        reason: `enrichProjectAction returned ${enrichResult.status}${enrichResult.error ? `: ${enrichResult.error}` : ""}`,
        wouldWrite: false,
      });
      continue;
    }

    for (const field of enrichResult.fields ?? []) {
      const decision = decideFieldAutomation(field);
      const wouldWrite = decision.decision === "AUTO_ACCEPT" && field.classification === "GREEN_NEW";
      rows.push({
        stagingRecordId: project.id,
        projectName: project.name,
        field: field.key,
        currentValue: field.currentValue,
        proposedValue: field.proposedValue,
        confidence: field.confidence,
        classification: field.classification,
        tier: decision.tier,
        sourceType: field.sourceType,
        sourceUrl: field.sourceUrl,
        decision: decision.decision,
        reason: decision.reason,
        wouldWrite,
      });
    }
  }
  return rows;
}

/** Phase 61 Section "Exact source URL duplicates" — reuses Phase 60's findExactSourceUrlDuplicate unchanged. Scoped to the 10 pilot records comparing against EACH OTHER only (never the wider staging universe — that is out of this controlled pilot's scope; see the phase report). Never merges, never overwrites — purely a warning row. */
function checkPilotInternalDuplicateUrls(rows: PilotFieldRow[]): DuplicateUrlWarning[] {
  const byRecord = new Map<string, { name: string; sourceUrl: string | null }>();
  for (const row of rows) {
    if (!byRecord.has(row.stagingRecordId) && row.sourceUrl) {
      byRecord.set(row.stagingRecordId, { name: row.projectName, sourceUrl: row.sourceUrl });
    }
  }
  const seen = [...byRecord.entries()].map(([id, v]) => ({ id, sourceUrl: v.sourceUrl, projectName: v.name }));
  const warnings: DuplicateUrlWarning[] = [];
  for (let i = 0; i < seen.length; i++) {
    const candidate = seen[i];
    const others = seen.filter((_, idx) => idx !== i).map((s) => ({ id: s.id, sourceUrl: s.sourceUrl }));
    const match = findExactSourceUrlDuplicate(others, candidate.sourceUrl);
    if (match) {
      const dupOf = seen.find((s) => s.id === match.existingId)!;
      warnings.push({
        stagingRecordId: candidate.id,
        projectName: candidate.projectName,
        duplicateOfStagingRecordId: dupOf.id,
        duplicateOfProjectName: dupOf.projectName,
        normalizedUrl: match.normalizedUrl,
      });
    }
  }
  return warnings;
}

/** Read-only. No writes beyond enrichProjectAction's own existing, pre-existing summary persistence. Same auth bar as every other enrichment action. `projects` defaults to the exact locked Phase 59B set (Phase 61's own behavior, unchanged); Phase 61A passes a different explicit, hardcoded list to validate genuinely new candidates. */
export async function runAutoAcceptPilotDryRun(projects: PilotProject[] = PILOT_PROJECTS): Promise<PilotDryRunResult> {
  await requireMutateSession();
  const rows = await computePilotRows(projects);
  const duplicateUrlWarnings = checkPilotInternalDuplicateUrls(rows);
  return { rows, duplicateUrlWarnings };
}

export type PilotWriteOutcome = "WRITTEN" | "SKIPPED_ALREADY_CURRENT" | "SKIPPED_NOT_AUTO_ACCEPT" | "SKIPPED_STALE_RECHECK" | "ERROR";

export interface PilotWriteRow extends PilotFieldRow {
  writeOutcome: PilotWriteOutcome;
  error?: string;
}

export interface PilotRealWriteResult {
  rows: PilotWriteRow[];
  duplicateUrlWarnings: DuplicateUrlWarning[];
}

/**
 * Records the WHY behind one machine-made acceptance, additively, on the
 * SAME existing AuditLog model and the SAME entityType/entityId
 * `acceptEnrichmentFieldAction` itself already uses for that field's own
 * accept event — this is a SECOND, SUPPLEMENTARY event, never a replacement
 * for the first. Distinguishable from a human accept purely by its
 * `action` string ("enrichment.autoAccept.evidence" vs the human path's
 * "enrichment.accept"/"enrichment.edit_accept"/"enrichment.re_accept") and by
 * `after.actorType`. `actorId` is deliberately still the real signed-in
 * session that TRIGGERED the pilot run (not a fabricated "system" user id --
 * this codebase's User table has no such concept and Phase 61 explicitly
 * forbids inventing new architecture) -- "who ran the automation" and "that
 * this specific decision was automated" are both fully recoverable from this
 * one event, which is exactly what Phase 61 asks the audit trail to answer.
 */
async function logMachineDecisionEvidence(actorId: string, row: PilotFieldRow): Promise<void> {
  await logAudit(actorId, "enrichment.autoAccept.evidence", ENRICHMENT_HISTORY_ENTITY_TYPE, row.stagingRecordId, {
    after: {
      fieldKey: row.field,
      actorType: "SYSTEM_AUTOMATION",
      automationRuleVersion: "phase61-tierA-pilot-v1",
      automationDecision: row.decision,
      classifierOutcome: row.classification,
      trustTier: row.tier,
      sourceTier: row.sourceType,
      sourceUrl: row.sourceUrl,
      previousValue: row.currentValue,
      acceptedValue: row.proposedValue,
      confidence: row.confidence,
      reason: row.reason,
    },
  });
}

/**
 * The real-write pilot. Re-derives the dry-run rows FRESH (Write Safety:
 * "re-check the current persisted value immediately before write" — this is
 * not the same call as any earlier dry-run the caller may have already run;
 * it re-fetches live), then for every row where Phase 60 says AUTO_ACCEPT
 * AND the field is genuinely GREEN_NEW (never for a CONFIRMED no-op, never
 * for anything else) writes through the EXISTING acceptEnrichmentFieldAction
 * — never a direct Prisma mutation from this module. Continues past any
 * single field's failure (Phase 61: "Do not let one bad field stop the
 * entire pilot") while never swallowing the error (every non-write outcome
 * is recorded on that row, not dropped).
 */
export async function runAutoAcceptPilotRealWrite(projects: PilotProject[] = PILOT_PROJECTS): Promise<PilotRealWriteResult> {
  const session = await requireMutateSession();
  const rows = await computePilotRows(projects);
  const duplicateUrlWarnings = checkPilotInternalDuplicateUrls(rows);

  const writeRows: PilotWriteRow[] = [];
  for (const row of rows) {
    if (row.decision !== "AUTO_ACCEPT" || !row.wouldWrite) {
      writeRows.push({ ...row, writeOutcome: row.decision === "AUTO_ACCEPT" ? "SKIPPED_ALREADY_CURRENT" : "SKIPPED_NOT_AUTO_ACCEPT" });
      continue;
    }

    // Re-check the record is still in an allowed state immediately before writing —
    // acceptEnrichmentFieldAction re-checks this itself too, but this makes the
    // pilot's own accounting of "why wasn't this written" explicit rather than
    // reporting a generic ERROR for what is actually an expected stale-state skip.
    const fresh = await prisma.ingestStagingRecord.findUnique({ where: { id: row.stagingRecordId }, select: { status: true } });
    if (!fresh || fresh.status !== "PENDING") {
      writeRows.push({ ...row, writeOutcome: "SKIPPED_STALE_RECHECK", error: `Record status is now "${fresh?.status ?? "NOT_FOUND"}", not PENDING.` });
      continue;
    }

    try {
      const result = await acceptEnrichmentFieldAction(row.stagingRecordId, row.field, row.proposedValue!, undefined, {
        currentDisplayValue: row.currentValue,
        sourceUrl: row.sourceUrl,
        sourceType: row.sourceType,
        confidence: row.confidence,
      });
      if (result.status !== "SUCCESS") {
        writeRows.push({ ...row, writeOutcome: "ERROR", error: result.error ?? result.status });
        continue;
      }
      await logMachineDecisionEvidence(session.userId, row);
      writeRows.push({ ...row, writeOutcome: "WRITTEN" });
    } catch (error) {
      writeRows.push({ ...row, writeOutcome: "ERROR", error: error instanceof Error ? error.message : String(error) });
      // Deliberately no rethrow — one field's failure must never stop the batch.
    }
  }

  return { rows: writeRows, duplicateUrlWarnings };
}
