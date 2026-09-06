import { describe, expect, it } from "vitest";
import { applyReviewSnapshotOverrides, type ReviewSnapshotFields } from "./reviewSnapshotOverrides";
import type { ProjectReviewSnapshot } from "@/lib/actions/enrichment";

interface FakeRecord extends ReviewSnapshotFields {
  id: string;
  proposedTitle: string;
}

function snapshot(proposedCount: number): ProjectReviewSnapshot {
  return {
    completeness: { groups: [], totalFields: 40, receivedCount: 40 - proposedCount, missingCount: proposedCount, needsReviewCount: 0 } as never,
    enrichmentBadge: { status: "READY", proposedCount, conflictCount: 0, lastRunAt: "2026-09-07T00:00:00.000Z" },
    enrichmentOutstanding: proposedCount > 0 ? { highlights: "YELLOW" } : {},
    readiness: { status: "READY", neededFieldLabels: [], missingFieldLabels: [] } as never,
  };
}

const RECORD_A: FakeRecord = {
  id: "rec-a",
  proposedTitle: "Linkbay Residences",
  completeness: { groups: [], totalFields: 40, receivedCount: 27, missingCount: 13, needsReviewCount: 0 } as never,
  enrichmentBadge: { status: "READY", proposedCount: 1, conflictCount: 1, lastRunAt: "2026-09-06T00:00:00.000Z" },
  enrichmentOutstanding: { highlights: "CONFLICT" },
  readiness: { status: "READY", neededFieldLabels: [], missingFieldLabels: [] } as never,
};

const RECORD_B: FakeRecord = {
  ...RECORD_A,
  id: "rec-b",
};

describe("applyReviewSnapshotOverrides (real-time Review Queue synchronization)", () => {
  it("1. ACCEPT/EDIT/REJECT/UNDO scenario -- a record WITH an override shows the snapshot's fresh values, replacing the stale prop entirely", () => {
    const result = applyReviewSnapshotOverrides([RECORD_A], { "rec-a": snapshot(0) });
    expect(result[0].enrichmentBadge?.proposedCount).toBe(0);
    expect(result[0].enrichmentBadge?.conflictCount).toBe(0);
    expect(result[0].enrichmentOutstanding).toEqual({});
  });

  it("2. a record with NO override is returned completely unchanged", () => {
    const result = applyReviewSnapshotOverrides([RECORD_A, RECORD_B], { "rec-a": snapshot(0) });
    expect(result[1]).toBe(RECORD_B); // same reference -- never rewritten
  });

  it("3. only the record the mutation targeted is affected -- a second record's stale-looking data is left alone, never guessed at", () => {
    const result = applyReviewSnapshotOverrides([RECORD_A, RECORD_B], { "rec-a": snapshot(0) });
    expect(result[0].enrichmentBadge?.proposedCount).toBe(0);
    expect(result[1].enrichmentBadge?.proposedCount).toBe(1); // RECORD_B's original value, untouched
  });

  it("4. sequential mutations on the SAME record: the latest snapshot always wins, a stale earlier one is never applied after a newer one", () => {
    // Mirrors how ReviewQueueList calls setSnapshotOverrides: each successful
    // mutation's snapshot replaces the previous one for that record id.
    const afterFirstMutation = { "rec-a": snapshot(1) };
    const afterSecondMutation = { ...afterFirstMutation, "rec-a": snapshot(0) };
    const result = applyReviewSnapshotOverrides([RECORD_A], afterSecondMutation);
    expect(result[0].enrichmentBadge?.proposedCount).toBe(0);
  });

  it("5. an empty overrides map returns every record unchanged (no mutation has happened yet)", () => {
    const result = applyReviewSnapshotOverrides([RECORD_A, RECORD_B], {});
    expect(result[0]).toBe(RECORD_A);
    expect(result[1]).toBe(RECORD_B);
  });
});
