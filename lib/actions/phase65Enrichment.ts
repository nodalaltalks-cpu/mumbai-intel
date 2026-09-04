"use server";

import { requireMutateSession } from "@/lib/auth/guard";
import { enrichProjectAction, acceptEnrichmentFieldAction } from "./enrichment";
import { decideFieldAutomation } from "@/lib/enrichment/autoDecideFieldAutomation";
import type { EnrichmentField } from "@/lib/enrichment/types";

/**
 * Phase 65 — debug-only orchestrator, same pattern as Phase 61's
 * autoAcceptPilot.ts: a plain reusable function invoked from a debug page
 * rather than the flaky Review Queue UI (which was hitting a real, unrelated
 * client-side rendering issue during this phase's interactive testing).
 * Uses ONLY the existing pipeline — enrichProjectAction (fresh live
 * enrichment), decideFieldAutomation (existing Phase 60 trust-tier engine,
 * unmodified), and acceptEnrichmentFieldAction (existing accept path).
 * AUTO_ACCEPT fields are actually written; everything else (HUMAN_REVIEW,
 * REJECT, MISSING) is only ever reported, never accepted here — that
 * decision stays with the founder via the existing Review Queue UI.
 */

export interface Phase65FieldRow {
  fieldKey: string;
  label: string;
  currentValue: string | null;
  proposedValue: string | null;
  classification: string;
  decision: string;
  reason: string;
  tier: string | null;
  sourceUrl: string | null;
  accepted: boolean;
  acceptError?: string;
}

export interface Phase65ProjectResult {
  stagingRecordId: string;
  enrichStatus: string;
  enrichError?: string;
  fields: Phase65FieldRow[];
}

export async function runPhase65EnrichmentPass(stagingRecordIds: string[]): Promise<Phase65ProjectResult[]> {
  const session = await requireMutateSession();
  const results: Phase65ProjectResult[] = [];

  for (const stagingRecordId of stagingRecordIds) {
    const enriched = await enrichProjectAction(stagingRecordId);
    if (enriched.status !== "SUCCESS" || !enriched.fields) {
      results.push({ stagingRecordId, enrichStatus: enriched.status, enrichError: enriched.error, fields: [] });
      continue;
    }

    const fieldRows: Phase65FieldRow[] = [];
    for (const field of enriched.fields as EnrichmentField[]) {
      const automation = decideFieldAutomation(field);
      let accepted = false;
      let acceptError: string | undefined;

      if (automation.decision === "AUTO_ACCEPT" && field.classification !== "CONFIRMED") {
        const acceptResult = await acceptEnrichmentFieldAction(stagingRecordId, field.key, field.proposedValue ?? "", field.proposedItems, {
          currentDisplayValue: field.currentValue,
        });
        if (acceptResult.status === "SUCCESS") accepted = true;
        else acceptError = acceptResult.error;
      }

      fieldRows.push({
        fieldKey: field.key,
        label: field.label,
        currentValue: field.currentValue,
        proposedValue: field.proposedValue,
        classification: field.classification,
        decision: automation.decision,
        reason: automation.reason,
        tier: automation.tier ?? null,
        sourceUrl: field.sourceUrl,
        accepted,
        acceptError,
      });
    }

    results.push({ stagingRecordId, enrichStatus: enriched.status, fields: fieldRows });
  }

  // Session identity is only needed to satisfy requireMutateSession's auth gate above;
  // acceptEnrichmentFieldAction re-derives its own session internally per call.
  void session;
  return results;
}
