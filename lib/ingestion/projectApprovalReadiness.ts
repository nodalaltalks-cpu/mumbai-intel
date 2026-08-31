import type { ReviewCompleteness } from "./reviewFieldRegistry";

export type ApprovalReadinessStatus = "READY" | "NEEDS_ATTENTION";

export interface ApprovalReadinessResult {
  status: ApprovalReadinessStatus;
  /** Labels of fields currently NEEDS_REVIEW (Phase 14C's YELLOW) -- these are what block "Ready". */
  neededFieldLabels: string[];
  /** Labels of fields currently MISSING (RED) -- informational only, does NOT block readiness (see doc comment below). */
  missingFieldLabels: string[];
}

/**
 * Phase 34 -- derives an approval-readiness verdict for a Project staging
 * record from the EXISTING completeness computation
 * (buildProjectReviewCompleteness()), never a second calculation. Applies
 * only to Project records (Part F); Builder/Locality/Transaction/InfraAsset
 * review is untouched.
 *
 * DEFINITION (see Phase 34's final report for the full discrepancy this
 * reconciles): "Ready" means no field is currently flagged NEEDS_REVIEW --
 * an unresolved duplicate-match conflict or similar ambiguity a human
 * hasn't looked at yet (the registry's own existing YELLOW semantic,
 * unchanged). A MISSING field does NOT block readiness.
 *
 * This is deliberately NOT "every field the registry tracks is filled in,"
 * and it is NOT an invented percentage threshold. It is also, honestly,
 * NOT a literal guarantee that approveStagingRecordAction/
 * applyProjectApproval would reject the record otherwise -- inspection of
 * that existing code found it validates nothing beyond `name` and
 * `localityId` for a Project, both of which are non-optional on
 * ProjectImportPayload and therefore already guaranteed present on every
 * staged Project record before this function ever runs. A literal
 * "would the DB write succeed" signal would therefore always read "ready"
 * regardless of completeness, which would not be a useful indicator. This
 * function instead surfaces the one EXISTING classification state
 * (NEEDS_REVIEW) that genuinely represents an unresolved question a human
 * should look at before treating the record as settled.
 */
export function computeApprovalReadiness(completeness: ReviewCompleteness): ApprovalReadinessResult {
  const neededFieldLabels: string[] = [];
  const missingFieldLabels: string[] = [];

  for (const group of completeness.groups) {
    for (const field of group.fields) {
      if (field.status === "NEEDS_REVIEW") neededFieldLabels.push(field.label);
      else if (field.status === "MISSING") missingFieldLabels.push(field.label);
    }
  }

  return {
    status: neededFieldLabels.length === 0 ? "READY" : "NEEDS_ATTENTION",
    neededFieldLabels,
    missingFieldLabels,
  };
}
