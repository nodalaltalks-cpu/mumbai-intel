import "server-only";
import { prisma } from "@/lib/prisma";
import { runAutoAcceptPilotRealWrite, type PilotWriteRow } from "@/lib/actions/autoAcceptPilot";
import { recordFounderException, getMostRecentFounderException } from "@/lib/enrichment/founderExceptions";
import type { ProjectImportPayload } from "@/lib/ingestion/connectors/fileImport/types";

/**
 * Phase 69 — the missing connection between Discovery's "Include" action and
 * the enrichment engine Phases 29/60/61/62A already built and shipped.
 *
 * Deliberately NOT a new engine: every real decision and every real write
 * still goes through the EXACT existing `runAutoAcceptPilotRealWrite` (Phase
 * 61's own auto-accept orchestrator, which itself only ever writes through
 * the existing `acceptEnrichmentFieldAction`) — this module's only new
 * behavior is (a) calling that orchestrator for an arbitrary just-included
 * staging record instead of the hardcoded 10-project pilot list, which
 * `runAutoAcceptPilotRealWrite` already supported as a plain parameter, and
 * (b) turning every field it could NOT safely auto-accept into a real
 * Founder Exception via the existing (previously unwired — see
 * founderExceptions.ts's own history) `recordFounderException`.
 *
 * Scope of what becomes an exception (Part "NO FALSE EXCEPTIONS"):
 *  - Skipped entirely: the synthetic "(enrichment)" row `computePilotRows`
 *    emits when the whole project has NO_SOURCE/SOURCE_UNAVAILABLE/ERROR --
 *    that's a project-level "automation couldn't run at all" signal, not a
 *    field, and forcing it through a per-field mechanism would leave a
 *    founder exception that can never resolve (see this file's own report).
 *    That project simply stays an ordinary incomplete PENDING staging record,
 *    same as before this phase -- still fully visible in Project Review.
 *  - Skipped: MISSING classification. Consistent with founderExceptions.ts's
 *    own long-standing doc comment ("MISSING is intentionally left unchanged
 *    ... only a caller that has genuinely exhausted reasonable sources
 *    should call recordFounderException") -- and with "not required for
 *    publication" for the large majority of the 44-field registry (tagline,
 *    videoUrl, specifications, faqs, metaTitle, ...). Raising an exception
 *    for every field a single official source page simply doesn't mention
 *    would flood the queue with non-actionable noise.
 *  - Raised: every other HUMAN_REVIEW row with a genuine non-empty
 *    `proposedValue` (CONFLICT, YELLOW, or a GREEN_NEW field routed to a
 *    human by tier policy/protected-identity/media checks) -- there is
 *    something concrete for the founder to look at and decide on, which is
 *    exactly what founderExceptions.ts's own "should represent actual work"
 *    rule asks for.
 *
 * Idempotency: re-raising the identical (fieldKey, reason) pair is skipped
 * (getMostRecentFounderException) -- a second run of this same function for
 * the same staging record produces no new AuditLog rows for anything that
 * hasn't actually changed. The underlying write path
 * (acceptEnrichmentFieldAction / applyAcceptedField) is already idempotent on
 * its own (Phase 46/60): re-accepting an unchanged value is a no-op write to
 * the same payload.
 */

export interface AutoEnrichOutcome {
  /** False only when the staging record could not be found/was not a Project record, or the whole pass threw. Include itself is never blocked by this. */
  ran: boolean;
  status: "SUCCESS" | "NO_SOURCE" | "SKIPPED_NOT_PROJECT" | "ERROR";
  autoAcceptedCount: number;
  exceptionCount: number;
  error?: string;
}

function isExceptionWorthy(row: PilotWriteRow): boolean {
  if (row.field === "(enrichment)") return false; // project-level fetch outcome, not a field — see doc comment above
  if (row.writeOutcome !== "SKIPPED_NOT_AUTO_ACCEPT") return false; // only "the engine looked and said a human must decide" rows
  if (row.classification === "MISSING") return false; // never fabricate a review item out of plain absence
  if (row.classification === "CONFIRMED") return false; // no-op, nothing to review (decideFieldAutomation already reports this as AUTO_ACCEPT anyway)
  return Boolean(row.proposedValue);
}

function recommendedAction(row: PilotWriteRow): string {
  if (row.classification === "CONFLICT") {
    return `The source disagrees with the current value ("${row.currentValue ?? "blank"}" vs. proposed "${row.proposedValue}"). Review both in Project Review and accept whichever is correct.`;
  }
  if (row.classification === "YELLOW") {
    return `The source flagged this value as lower-confidence/ambiguous ("${row.proposedValue}"). Review it in Project Review before accepting.`;
  }
  return `A new value was found ("${row.proposedValue}") but this field is never auto-accepted in v1. Review it in Project Review and accept it manually if correct.`;
}

/**
 * Runs the automated enrichment pass for ONE just-staged Project staging
 * record. Never throws — every failure mode is captured into `status`/`error`
 * instead, exactly like `bulkEnrichment.ts`'s own `processTarget` — so a
 * caller (Discovery's own Include action) can safely await this inline
 * without risking Include's own success on an enrichment-side failure.
 */
export async function runAutomaticEnrichmentForStagingRecord(actorId: string, stagingRecordId: string): Promise<AutoEnrichOutcome> {
  try {
    const record = await prisma.ingestStagingRecord.findUnique({ where: { id: stagingRecordId } });
    if (!record || record.entityType !== "Project") {
      return { ran: false, status: "SKIPPED_NOT_PROJECT", autoAcceptedCount: 0, exceptionCount: 0 };
    }
    const payload = record.payload as unknown as ProjectImportPayload;

    const result = await runAutoAcceptPilotRealWrite([{ id: stagingRecordId, name: payload.name }]);

    let autoAcceptedCount = 0;
    let exceptionCount = 0;
    let sourceFound = false;

    for (const row of result.rows) {
      if (row.field === "(enrichment)") continue;
      sourceFound = true;

      if (row.writeOutcome === "WRITTEN") {
        autoAcceptedCount++;
        continue;
      }
      if (!isExceptionWorthy(row)) continue;

      const existing = await getMostRecentFounderException(stagingRecordId, row.field);
      if (existing && existing.reason === row.reason) continue; // identical re-raise — no new audit row

      await recordFounderException(actorId, stagingRecordId, row.field, {
        reason: row.reason,
        sourcesChecked: [row.sourceType ? `${row.sourceType} source` : "No trusted source tier recorded"],
        lastAttemptedSource: row.sourceUrl ?? "No source URL recorded",
        recommendedFounderAction: recommendedAction(row),
      });
      exceptionCount++;
    }

    return { ran: true, status: sourceFound ? "SUCCESS" : "NO_SOURCE", autoAcceptedCount, exceptionCount };
  } catch (error) {
    // Best-effort by design (Part "ERROR HANDLING" / Include must never fail
    // because automatic enrichment failed) — the staging record Include
    // already created is unaffected; the founder just sees it un-enriched.
    return { ran: false, status: "ERROR", autoAcceptedCount: 0, exceptionCount: 0, error: error instanceof Error ? error.message : String(error) };
  }
}
