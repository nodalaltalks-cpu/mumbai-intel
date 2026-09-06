import { buildProjectReviewCompleteness, type ProjectReviewContext } from "../ingestion/reviewFieldRegistry";
import type { ProjectImportPayload } from "../ingestion/connectors/fileImport/types";
import { SOURCE_TIER_RANK, type EnrichmentField, type SourceFactsMap, type SourceMeta } from "./types";

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

  for (const group of completeness.groups) {
    for (const field of group.fields) {
      const currentValue = field.status === "MISSING" ? null : field.value;
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
