import type { FieldStatus, ReviewCompleteness, ReviewField } from "./reviewFieldRegistry";

/**
 * Phase 71B — the Founder Review Queue must not force the founder to
 * evaluate the full ~40-field ingestion/enrichment schema
 * (buildProjectReviewCompleteness) to answer three questions: what did we
 * receive, is anything conflicting, is anything IMPORTANT missing. This
 * module is a pure, read-only PRESENTATION filter over the EXISTING
 * `ReviewCompleteness` object — it never recomputes field values, never
 * touches the registry's own RECEIVED/MISSING/NEEDS_REVIEW rules, and never
 * changes `totalFields`/`receivedCount`/`missingCount`/`needsReviewCount`
 * (those remain the untouched technical/ingestion metric used elsewhere).
 *
 * The 18-field founder-facing Project model (see ProjectForm.tsx) has TWO
 * fields with no representation anywhere in the Project staging/ingestion
 * schema, by design, not by omission here:
 *   - Configuration: a `Configuration` row is a CHILD of a real `Project`
 *     (`onDelete: Cascade` on `projectId`), so it cannot exist before a
 *     staging candidate is approved into a real Project. Never part of
 *     `ProjectImportPayload`.
 *   - Developer Spokesperson: lives only on `BuilderImportPayload`/the
 *     `Builder` model, never on `ProjectImportPayload`.
 * Deliberately NOT invented here — see this phase's own audit trail.
 *
 * Official Developer Website (targeted fix) IS now included below --
 * `ProjectImportPayload.developerWebsiteUrl` is a founder-editable override
 * that falls back to the existing Builder.websiteUrl resolution (see
 * reviewFieldRegistry.ts's own field definition and
 * lib/actions/enrichment.ts's resolveOfficialDeveloperWebsite), so this no
 * longer needs a resolved builderId pre-approval to show a real value.
 *
 * Targeted fix (Highlights removed from this summary only) -- `highlights`
 * is deliberately EXCLUDED from FOUNDER_FIELD_LABELS below: not important
 * enough for the Approval Ready decision, per explicit founder instruction.
 * This is a presentation-only omission, exactly like this module's own
 * doc comment above already promises -- the underlying `highlights` data,
 * `buildProjectReviewCompleteness`'s own field, Enrichment's Edit/Accept/
 * Reject/History for it, and its `totalFields`/`receivedCount`/etc. are all
 * completely untouched; it simply never appears in this ONE filtered list.
 */

export interface FounderReviewField {
  key: string;
  label: string;
  status: FieldStatus;
  value: string | null;
  reviewNote?: string;
}

export interface FounderReviewSummary {
  fields: FounderReviewField[];
  totalFields: number;
  receivedCount: number;
  missingCount: number;
  needsReviewCount: number;
}

export interface EnrichmentConflict {
  key: string;
  label: string;
  existingValue: string | null;
}

/**
 * Ordered registry-key -> founder-facing label. `possession` is a synthetic
 * key (not a real registry field) that merges the registry's own
 * `possessionMonth`/`possessionYear` pair — both are always derived from the
 * same single `possessionDateIso` payload value, so they are one fact to a
 * founder, exactly as `possessionMonth`/`possessionYear` are already
 * reconciled into one `Possession` field on the live Project/ProjectForm.
 */
const FOUNDER_FIELD_LABELS: readonly (readonly [string, string])[] = [
  ["name", "Project Name"],
  ["developerGroup", "Developer"],
  ["developerWebsiteUrl", "Official Developer Website"],
  ["locality", "Locality"],
  ["microMarket", "Micro-market"],
  ["status", "Status"],
  ["category", "Category"],
  ["address", "Address"],
  ["priceMin", "Starting Price"],
  ["reraNumber", "RERA Number"],
  ["possession", "Possession"],
  ["description", "Description"],
  ["amenities", "Amenities"],
  ["coverImage", "Cover Image"],
  ["brochure", "Brochure PDF"],
];

function flattenByKey(completeness: ReviewCompleteness): Map<string, ReviewField> {
  return new Map(completeness.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
}

/** Merges the registry's `possessionMonth`+`possessionYear` pair into one founder-facing `possession` field. RECEIVED only when both halves are RECEIVED (they always share one source value); NEEDS_REVIEW if either half does; MISSING otherwise. */
function mergedPossessionField(byKey: Map<string, ReviewField>): FounderReviewField {
  const month = byKey.get("possessionMonth");
  const year = byKey.get("possessionYear");
  const statuses = [month?.status, year?.status];
  const status: FieldStatus = statuses.includes("NEEDS_REVIEW")
    ? "NEEDS_REVIEW"
    : statuses.every((s) => s === "RECEIVED")
      ? "RECEIVED"
      : "MISSING";
  const value = status === "MISSING" ? null : [month?.value, year?.value].filter(Boolean).join(" ") || null;
  const reviewNote = month?.reviewNote ?? year?.reviewNote;
  return { key: "possession", label: "Possession", status, value, reviewNote };
}

/**
 * Filters/relabels the EXISTING Project completeness object down to the 15
 * founder-relevant fields (18 minus Configuration/Developer
 * Website/Spokesperson — see this file's doc comment). Returns null for a
 * completeness object that isn't shaped like a Project's (no `general`
 * group) — Builder/Locality/Transaction/InfraAsset records keep their
 * existing, unfiltered Review Queue presentation unchanged.
 */
export function buildFounderReviewSummary(completeness: ReviewCompleteness): FounderReviewSummary | null {
  if (!completeness.groups.some((g) => g.key === "general")) return null;
  const byKey = flattenByKey(completeness);

  const fields: FounderReviewField[] = FOUNDER_FIELD_LABELS.map(([key, label]) => {
    if (key === "possession") return mergedPossessionField(byKey);
    const f = byKey.get(key);
    return {
      key,
      label,
      status: f?.status ?? "MISSING",
      value: f?.status === "MISSING" || !f ? null : f.value,
      reviewNote: f?.reviewNote,
    };
  });

  return {
    fields,
    totalFields: fields.length,
    receivedCount: fields.filter((f) => f.status === "RECEIVED").length,
    missingCount: fields.filter((f) => f.status === "MISSING").length,
    needsReviewCount: fields.filter((f) => f.status === "NEEDS_REVIEW").length,
  };
}

/**
 * Turns the EXISTING persisted `enrichmentSummary.outstanding` map (see
 * lib/enrichment/enrichmentSummary.ts — already computed by the existing
 * Enrich Project action, never recomputed here) into a display-ready
 * conflict list. Deliberately covers EVERY conflicting field, not only the
 * 15 founder-relevant ones — a CONFLICT means enrichment found a live
 * source disagreeing with the current staged value, which is a real
 * data-safety signal regardless of which field it lands on.
 *
 * `enrichmentSummary.outstanding` intentionally never stores the proposed
 * value or source/evidence (see that file's own doc comment) — only the
 * classification. The existing value shown here comes from the already-
 * computed `completeness` object; the proposed value and source are NOT
 * fabricated when unavailable — the caller is expected to point the founder
 * at the existing "Enrich Project" action to see them.
 */
export function buildEnrichmentConflicts(
  completeness: ReviewCompleteness,
  outstanding: Record<string, "GREEN_NEW" | "YELLOW" | "CONFLICT"> | null | undefined
): EnrichmentConflict[] {
  if (!outstanding) return [];
  const byKey = flattenByKey(completeness);
  return Object.entries(outstanding)
    .filter(([, classification]) => classification === "CONFLICT")
    .map(([key]) => {
      const f = byKey.get(key);
      return { key, label: f?.label ?? key, existingValue: f?.value ?? null };
    });
}
