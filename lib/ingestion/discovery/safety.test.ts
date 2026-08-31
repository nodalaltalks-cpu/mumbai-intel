import { describe, expect, it } from "vitest";
import { DISCOVERY_ENTITY_TYPE, type DiscoveryStatus } from "./types";

/**
 * Phase 39 Part M — documents, in code, the exact isolation property this
 * module's design depends on: `entityType`/`status` values a discovery
 * candidate ever uses must never collide with the values every EXISTING
 * IngestStagingRecord query filters on (getPendingStagingRecords's
 * `status: "PENDING"`, the Review Queue's `entityType === "Project"` etc.
 * branches, approve/reject/rollback's `"APPROVED"`/`"REJECTED"`/
 * `"ROLLED_BACK"` writes). If this test ever fails, the discovery feature
 * would leak into the existing Review Queue or Data Sync summary counts.
 */
describe("discovery entityType/status isolation from the existing staging pipeline (Phase 39 Part M)", () => {
  const EXISTING_ENTITY_TYPES = ["Project", "Builder", "Locality", "Transaction", "InfraAsset"];
  const EXISTING_STATUS_VALUES = ["PENDING", "APPROVED", "REJECTED", "ROLLED_BACK"];
  const DISCOVERY_STATUSES: DiscoveryStatus[] = [
    "DISCOVERED",
    "SOURCE_FOUND",
    "READY_FOR_ENRICHMENT",
    "ENRICHED",
    "NEEDS_REVIEW",
    "REJECTED_DUPLICATE",
    "EXCLUDED",
  ];

  it("15. DISCOVERY_ENTITY_TYPE is not one of the five existing entityType values", () => {
    expect(EXISTING_ENTITY_TYPES).not.toContain(DISCOVERY_ENTITY_TYPE);
  });

  it("16. no discovery status string ever equals an existing staging-record status value (so getPendingStagingRecords's status:'PENDING' filter can never return a discovery candidate)", () => {
    for (const status of DISCOVERY_STATUSES) {
      expect(EXISTING_STATUS_VALUES).not.toContain(status);
    }
  });
});
