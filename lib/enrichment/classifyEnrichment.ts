import { buildProjectReviewCompleteness, type ProjectReviewContext } from "../ingestion/reviewFieldRegistry";
import { mergeLegacyPaymentPlans } from "../ingestion/paymentPlanFormat";
import type { ProjectImportPayload } from "../ingestion/connectors/fileImport/types";
import { SOURCE_TIER_RANK, type EnrichmentField, type SourceFactsMap, type SourceMeta } from "./types";
import type { EnrichmentHistoryActionType, EnrichmentHistorySnapshot } from "./enrichmentHistory";

/** Case/whitespace-insensitive equality for display-string comparison -- deliberately simple for this MVP; a false CONFLICT (over-flagging) is far safer than a false CONFIRMED (silently missing a real disagreement). */
function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Classifies one source's facts against the CURRENT staging payload for
 * every one of the existing Project fields -- reusing
 * buildProjectReviewCompleteness() UNCHANGED for the field list, labels,
 * grouping, and "is this field currently received or missing" question, so
 * enrichment and the Review Queue's own completeness count can never
 * disagree about what "currently received" means.
 *
 * Implements exactly the 5 rules from Phase 28 Part M:
 *  1. existing blank + high-confidence new value  -> GREEN_NEW
 *  2. existing blank + ambiguous new value         -> YELLOW
 *  3. existing value + same source value           -> CONFIRMED
 *  4. existing value + different source value      -> CONFLICT (never auto-applied)
 *  5. no source value                              -> MISSING if currently blank, CONFIRMED if a value already exists
 *
 * Phase 67 removed the `priceMax` field (and its single-listing-artifact
 * exception below) along with `latitude`/`longitude`/`reraStatus` — a
 * project-level maximum price is misleading (varies by configuration/unit),
 * and none of the other three were ever maintained.
 *
 * Targeted fix (post-Phase 71B founder testing): rule 5 used to classify a
 * field as MISSING whenever no source even attempted it, regardless of
 * whether a real value already existed (e.g. `dataSource`/`sourceRef` are
 * never something an adapter reports on, so they were ALWAYS "MISSING" even
 * though the current value was perfectly fine). MISSING must mean "no
 * meaningful value exists anywhere" — a populated current value with no
 * competing source opinion is CONFIRMED (the existing value stands, nothing
 * to write), exactly like rule 3's "agrees with the source" case. This never
 * changes rule 1/2/4's behavior and never touches `decideFieldAutomation`,
 * which already treats CONFIRMED as a safe no-op.
 */
export function classifyProjectEnrichment(
  currentPayload: ProjectImportPayload,
  context: ProjectReviewContext,
  sourceFacts: SourceFactsMap,
  sourceMeta: SourceMeta
): EnrichmentField[] {
  const completeness = buildProjectReviewCompleteness(currentPayload, context);
  const results: EnrichmentField[] = [];
  // Targeted fix (Payment Plan editor) -- the ONE field whose editor needs
  // to reconstruct real structured entries from the CURRENT value, not just
  // its "N plan(s) listed" count string. Computed once via the exact same
  // merge function the registry itself uses, so this can never disagree
  // with what buildProjectReviewCompleteness already decided is current.
  const raw = currentPayload as unknown as Record<string, unknown>;
  const currentPaymentPlanItems = mergeLegacyPaymentPlans(raw.paymentPlans, raw.paymentPlanType, raw.paymentPlanDescription);

  for (const group of completeness.groups) {
    for (const field of group.fields) {
      const currentValue = field.status === "MISSING" ? null : field.value;
      const currentItems = field.key === "paymentPlans" ? currentPaymentPlanItems : undefined;
      const fact = sourceFacts[field.key];

      if (!fact) {
        results.push({
          key: field.key,
          label: field.label,
          group: group.label,
          currentValue,
          // Mirrors rule 3's CONFIRMED shape (proposedValue = the value that
          // stands) rather than null -- a populated field with no competing
          // source opinion isn't "nothing proposed", it's "current value
          // confirmed by omission".
          proposedValue: currentValue,
          sourceUrl: null,
          sourceType: null,
          confidence: null,
          classification: currentValue !== null ? "CONFIRMED" : "MISSING",
          reason: currentValue
            ? "No new source value found for this field; the existing value is retained as-is."
            : "No value found for this field in any inspected source.",
          currentItems,
        });
        continue;
      }

      const proposedValue = fact.value;
      const sameValue = currentValue !== null && normalizeForCompare(currentValue) === normalizeForCompare(proposedValue);

      let classification: EnrichmentField["classification"];
      let reason: string;

      if (currentValue === null) {
        if (fact.ambiguous || fact.confidence === "Low") {
          classification = "YELLOW";
          reason = fact.note ?? "A new value was found but needs human confirmation before it's treated as final.";
        } else {
          classification = "GREEN_NEW";
          reason = "Field is currently blank; a high-confidence value was found and can be safely added.";
        }
      } else if (sameValue) {
        classification = "CONFIRMED";
        reason = "The new source agrees with the existing value.";
      } else {
        classification = "CONFLICT";
        reason = "The new source disagrees with the existing value. Never auto-changed — human review required.";
      }

      results.push({
        key: field.key,
        label: field.label,
        group: group.label,
        currentValue,
        proposedValue,
        sourceUrl: sourceMeta.url,
        sourceType: sourceMeta.tier,
        confidence: fact.confidence,
        classification,
        reason,
        proposedItems: fact.items,
        currentItems,
      });
    }
  }

  return results;
}

/**
 * Merges enrichment results from multiple sources for the same project,
 * field by field -- Phase 28 Part D/K (multi-source support, source
 * priority). For each field, the highest-tier (lowest SOURCE_TIER_RANK)
 * source that actually found a value wins; sources that found nothing for a
 * field never suppress a lower-tier source's finding. This determines whose
 * PROPOSAL is shown, never authorizes overwriting an existing value --
 * CONFLICT/YELLOW classification still applies exactly as if that source had
 * been the only one consulted.
 */
export function mergeEnrichmentResults(resultsBySource: EnrichmentField[][]): EnrichmentField[] {
  const byKey = new Map<string, EnrichmentField>();

  for (const results of resultsBySource) {
    for (const field of results) {
      if (field.classification === "MISSING") {
        if (!byKey.has(field.key)) byKey.set(field.key, field);
        continue;
      }
      const existing = byKey.get(field.key);
      if (
        !existing ||
        existing.classification === "MISSING" ||
        (field.sourceType && existing.sourceType && SOURCE_TIER_RANK[field.sourceType] < SOURCE_TIER_RANK[existing.sourceType])
      ) {
        byKey.set(field.key, field);
      }
    }
  }

  return [...byKey.values()];
}

/**
 * Targeted fix (repeated rejected proposal bug) -- a fresh "Enrich Project"
 * run re-fetches the source and re-classifies EVERY field from scratch
 * (classifyProjectEnrichment has no memory of past founder decisions by
 * design -- it's a pure function of the current payload + live facts). That
 * means a field the founder EXPLICITLY rejected reappears as an identical
 * outstanding proposal on every subsequent run, forever, even though nothing
 * about it has changed -- there is no way to permanently dismiss a stale
 * source disagreement.
 *
 * This is a POST-PROCESSING pass over classifyProjectEnrichment's own
 * output, applied by the caller (enrichProjectAction) using history it
 * fetches itself -- classifyProjectEnrichment stays pure/DB-free and
 * unchanged, so every existing caller (researchProvider.ts, every adapter
 * test) is unaffected.
 *
 * The rule: if the MOST RECENT history event for a field is a REJECT, and
 * the freshly classified proposal is the EXACT SAME value + items + source
 * URL the founder already declined, fold it back to CONFIRMED (the current
 * value stands, nothing new to review) rather than showing it again. If
 * EITHER the proposed value/items OR the source URL differs at all, the new
 * proposal is materially different and is let through unchanged -- this
 * never permanently suppresses a field, only an identical repeat.
 */
export function suppressPreviouslyRejectedProposals(
  fields: EnrichmentField[],
  mostRecentEventByField: Map<string, { action: EnrichmentHistoryActionType; after: EnrichmentHistorySnapshot | null }>
): EnrichmentField[] {
  return fields.map((field) => {
    if (field.classification !== "GREEN_NEW" && field.classification !== "YELLOW" && field.classification !== "CONFLICT") return field;
    const event = mostRecentEventByField.get(field.key);
    if (!event || event.action !== "REJECT" || !event.after) return field;

    const sameValue = normalizeForCompare(event.after.displayValue ?? "") === normalizeForCompare(field.proposedValue ?? "");
    const sameItems = JSON.stringify(event.after.displayItems ?? null) === JSON.stringify(field.proposedItems ?? null);
    const sameSource = (event.after.sourceUrl ?? null) === (field.sourceUrl ?? null);
    if (!sameValue || !sameItems || !sameSource) return field;

    return {
      ...field,
      classification: "CONFIRMED" as const,
      proposedValue: field.currentValue,
      proposedItems: undefined,
      reason: "This exact proposal was already reviewed and declined -- the current value stands. A materially different proposed value or source will be shown again for review.",
    };
  });
}
