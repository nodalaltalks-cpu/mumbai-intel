import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Data Sync Control Center fix — Problem 2 (Delete/Trash), Part 12 items
 * 13/18/19/20/21. Source-inspection regression guard (no jsdom/RTL
 * environment -- see EnrichmentProposalPanel.test.ts's own note) confirming
 * each Data Sync queue's trash affordance targets the CORRECT underlying
 * entity/mutation, and that nothing here ever reaches a live, approved
 * Project/Transaction row.
 */
const REVIEW_QUEUE_SOURCE = readFileSync(path.resolve(import.meta.dirname, "ReviewQueueList.tsx"), "utf8");
const TRANSACTION_REVIEW_SOURCE = readFileSync(path.resolve(import.meta.dirname, "TransactionReviewList.tsx"), "utf8");
const DISCOVERY_SOURCE = readFileSync(path.resolve(import.meta.dirname, "DiscoveryCandidateList.tsx"), "utf8");

describe("Project Review (18/19) -- Trash wraps the EXISTING PENDING-record rejection, nothing else changed", () => {
  it("uses TrashConfirmButton wrapping the exact same existing rejectStagingRecordAction", () => {
    expect(REVIEW_QUEUE_SOURCE).toContain("<TrashConfirmButton");
    expect(REVIEW_QUEUE_SOURCE).toContain("action={rejectStagingRecordAction.bind(null, record.id)}");
  });

  it("Approve is completely untouched -- still the original ConfirmButton, not routed through Trash", () => {
    expect(REVIEW_QUEUE_SOURCE).toContain("action={approveStagingRecordAction.bind(null, record.id)}");
    expect(REVIEW_QUEUE_SOURCE).toContain('label="Approve"');
  });

  it("no bulk delete was added -- bulk actions remain exactly Approve/Reject as before", () => {
    expect(REVIEW_QUEUE_SOURCE).not.toMatch(/runBulkTrash|bulkTrash|bulkDelete/i);
  });
});

describe("Transaction Review (21) -- uses the Transaction staging record's own reject/trash mechanism, never a Project action", () => {
  it("imports rejectStagingRecordAction from lib/actions/ingestion, the SAME entity-agnostic action Transaction approval already uses -- never a Project-specific delete", () => {
    expect(TRANSACTION_REVIEW_SOURCE).toContain('from "@/lib/actions/ingestion"');
    expect(TRANSACTION_REVIEW_SOURCE).not.toMatch(/deleteProjectAction|permanentlyDeleteProjectAction/);
  });

  it("wires TrashConfirmButton to that same rejectStagingRecordAction, scoped to this record's own id", () => {
    expect(TRANSACTION_REVIEW_SOURCE).toContain("<TrashConfirmButton");
    expect(TRANSACTION_REVIEW_SOURCE).toContain("action={rejectStagingRecordAction.bind(null, record.id)}");
  });
});

describe("Discovery (13/20) -- Exclude now confirms before acting, and never touches a live Project", () => {
  it("Exclude opens a confirmation dialog instead of firing immediately", () => {
    expect(DISCOVERY_SOURCE).toContain("setExcludeConfirmRow(row)");
    expect(DISCOVERY_SOURCE).not.toContain('onClick={() => handleAction(row, "EXCLUDE")}');
  });

  it("confirming still calls the exact same, pre-existing handleAction(row, \"EXCLUDE\") -- no new mutation path", () => {
    expect(DISCOVERY_SOURCE).toContain('await handleAction(row, "EXCLUDE");');
  });

  it("never calls a Project-level delete/trash action -- Discovery candidates are pre-Project staging rows only", () => {
    expect(DISCOVERY_SOURCE).not.toMatch(/deleteProjectAction|permanentlyDeleteProjectAction/);
  });

  it("the confirmation shows the candidate's identity (project name + developer) and the required warning copy", () => {
    expect(DISCOVERY_SOURCE).toContain("excludeConfirmRow.payload.projectName");
    expect(DISCOVERY_SOURCE).toContain("excludeConfirmRow.payload.developerName");
    expect(DISCOVERY_SOURCE).toContain("This will remove it from the active Data Sync workflow. You can restore it from Trash.");
  });
});

describe("No page in this change reaches a live/approved Project or Transaction row for deletion (20)", () => {
  it("none of the three Data Sync queues import the approved-entity Trash actions", () => {
    for (const source of [REVIEW_QUEUE_SOURCE, TRANSACTION_REVIEW_SOURCE, DISCOVERY_SOURCE]) {
      expect(source).not.toMatch(/deleteProjectAction|permanentlyDeleteProjectAction|deleteTransactionAction/);
    }
  });
});
