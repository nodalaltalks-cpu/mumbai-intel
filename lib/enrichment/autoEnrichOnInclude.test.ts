import { describe, expect, it, vi, beforeEach } from "vitest";

const findUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ingestStagingRecord: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
  },
}));

const runAutoAcceptPilotRealWriteMock = vi.fn();
vi.mock("@/lib/actions/autoAcceptPilot", () => ({
  runAutoAcceptPilotRealWrite: (...args: unknown[]) => runAutoAcceptPilotRealWriteMock(...args),
}));

const recordFounderExceptionMock = vi.fn();
const getMostRecentFounderExceptionMock = vi.fn();
vi.mock("@/lib/enrichment/founderExceptions", () => ({
  recordFounderException: (...args: unknown[]) => recordFounderExceptionMock(...args),
  getMostRecentFounderException: (...args: unknown[]) => getMostRecentFounderExceptionMock(...args),
}));

import { runAutomaticEnrichmentForStagingRecord } from "./autoEnrichOnInclude";
import type { PilotWriteRow } from "@/lib/actions/autoAcceptPilot";

function row(overrides: Partial<PilotWriteRow>): PilotWriteRow {
  return {
    stagingRecordId: "staging-1",
    projectName: "Test Project",
    field: "reraNumber",
    currentValue: null,
    proposedValue: "P51800080217",
    confidence: "High",
    classification: "GREEN_NEW",
    tier: "A",
    sourceType: "OFFICIAL_DEVELOPER",
    sourceUrl: "https://developer.example.com/project",
    decision: "AUTO_ACCEPT",
    reason: "Tier A field, GREEN_NEW, trusted official source.",
    wouldWrite: true,
    writeOutcome: "WRITTEN",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueMock.mockResolvedValue({ id: "staging-1", entityType: "Project", payload: { name: "Test Project" } });
  getMostRecentFounderExceptionMock.mockResolvedValue(null);
});

describe("runAutomaticEnrichmentForStagingRecord", () => {
  it("1. SAFE AUTO ACCEPT — a WRITTEN row is counted and never raises an exception", async () => {
    runAutoAcceptPilotRealWriteMock.mockResolvedValue({ rows: [row({})], duplicateUrlWarnings: [] });
    const result = await runAutomaticEnrichmentForStagingRecord("user-1", "staging-1");
    expect(result.ran).toBe(true);
    expect(result.status).toBe("SUCCESS");
    expect(result.autoAcceptedCount).toBe(1);
    expect(result.exceptionCount).toBe(0);
    expect(recordFounderExceptionMock).not.toHaveBeenCalled();
  });

  it("2. CONFLICT — never written, and raises exactly one Founder Exception with the real evidence", async () => {
    runAutoAcceptPilotRealWriteMock.mockResolvedValue({
      rows: [
        row({
          field: "priceMin",
          classification: "CONFLICT",
          decision: "HUMAN_REVIEW",
          currentValue: "5.61 Cr",
          proposedValue: "6.10 Cr",
          reason: "The new source disagrees with the existing value.",
          wouldWrite: false,
          writeOutcome: "SKIPPED_NOT_AUTO_ACCEPT",
        }),
      ],
      duplicateUrlWarnings: [],
    });
    const result = await runAutomaticEnrichmentForStagingRecord("user-1", "staging-1");
    expect(result.autoAcceptedCount).toBe(0);
    expect(result.exceptionCount).toBe(1);
    expect(recordFounderExceptionMock).toHaveBeenCalledTimes(1);
    const [actorId, stagingRecordId, fieldKey, evidence] = recordFounderExceptionMock.mock.calls[0];
    expect(actorId).toBe("user-1");
    expect(stagingRecordId).toBe("staging-1");
    expect(fieldKey).toBe("priceMin");
    expect(evidence.reason).toContain("disagrees");
    expect(evidence.recommendedFounderAction).toContain("6.10 Cr");
  });

  it("3. MISSING — never fabricates a value and never raises a false exception", async () => {
    runAutoAcceptPilotRealWriteMock.mockResolvedValue({
      rows: [
        row({
          field: "possessionMonth",
          classification: "MISSING",
          decision: "MISSING",
          proposedValue: null,
          reason: "No evidence found for this field.",
          wouldWrite: false,
          writeOutcome: "SKIPPED_NOT_AUTO_ACCEPT",
        }),
      ],
      duplicateUrlWarnings: [],
    });
    const result = await runAutomaticEnrichmentForStagingRecord("user-1", "staging-1");
    expect(result.autoAcceptedCount).toBe(0);
    expect(result.exceptionCount).toBe(0);
    expect(recordFounderExceptionMock).not.toHaveBeenCalled();
  });

  it("3b. NO_SOURCE — the synthetic '(enrichment)' row is never turned into a field exception", async () => {
    runAutoAcceptPilotRealWriteMock.mockResolvedValue({
      rows: [
        row({
          field: "(enrichment)",
          classification: "MISSING",
          decision: "HUMAN_REVIEW",
          currentValue: null,
          proposedValue: null,
          reason: "enrichProjectAction returned NO_SOURCE",
          wouldWrite: false,
          writeOutcome: "SKIPPED_NOT_AUTO_ACCEPT",
        }),
      ],
      duplicateUrlWarnings: [],
    });
    const result = await runAutomaticEnrichmentForStagingRecord("user-1", "staging-1");
    expect(result.status).toBe("NO_SOURCE");
    expect(result.exceptionCount).toBe(0);
    expect(recordFounderExceptionMock).not.toHaveBeenCalled();
  });

  it("4. PARTIAL FAILURE — one CONFLICT field does not stop an unrelated safe field from being counted as written", async () => {
    runAutoAcceptPilotRealWriteMock.mockResolvedValue({
      rows: [
        row({ field: "reraNumber", writeOutcome: "WRITTEN" }),
        row({
          field: "possessionMonth",
          classification: "CONFLICT",
          decision: "HUMAN_REVIEW",
          proposedValue: "March",
          currentValue: "June",
          reason: "conflict",
          writeOutcome: "SKIPPED_NOT_AUTO_ACCEPT",
        }),
      ],
      duplicateUrlWarnings: [],
    });
    const result = await runAutomaticEnrichmentForStagingRecord("user-1", "staging-1");
    expect(result.autoAcceptedCount).toBe(1);
    expect(result.exceptionCount).toBe(1);
  });

  it("5. IDEMPOTENCY — an identical (fieldKey, reason) re-raise is skipped, a genuinely changed reason is not", async () => {
    getMostRecentFounderExceptionMock.mockResolvedValueOnce({ reason: "The new source disagrees with the existing value." });
    runAutoAcceptPilotRealWriteMock.mockResolvedValue({
      rows: [
        row({
          field: "priceMin",
          classification: "CONFLICT",
          decision: "HUMAN_REVIEW",
          proposedValue: "6.10 Cr",
          reason: "The new source disagrees with the existing value.",
          writeOutcome: "SKIPPED_NOT_AUTO_ACCEPT",
        }),
      ],
      duplicateUrlWarnings: [],
    });
    const first = await runAutomaticEnrichmentForStagingRecord("user-1", "staging-1");
    expect(first.exceptionCount).toBe(0);
    expect(recordFounderExceptionMock).not.toHaveBeenCalled();

    getMostRecentFounderExceptionMock.mockResolvedValueOnce({ reason: "A different, older reason." });
    const second = await runAutomaticEnrichmentForStagingRecord("user-1", "staging-1");
    expect(second.exceptionCount).toBe(1);
    expect(recordFounderExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("6. re-running the whole pass twice never duplicates the write — WRITTEN rows are always reported, never re-flagged as exceptions", async () => {
    runAutoAcceptPilotRealWriteMock.mockResolvedValue({ rows: [row({})], duplicateUrlWarnings: [] });
    const run1 = await runAutomaticEnrichmentForStagingRecord("user-1", "staging-1");
    const run2 = await runAutomaticEnrichmentForStagingRecord("user-1", "staging-1");
    expect(run1.autoAcceptedCount).toBe(1);
    expect(run2.autoAcceptedCount).toBe(1);
    expect(recordFounderExceptionMock).not.toHaveBeenCalled();
  });

  it("7. staging record not found — returns SKIPPED_NOT_PROJECT without calling the enrichment engine", async () => {
    findUniqueMock.mockResolvedValue(null);
    const result = await runAutomaticEnrichmentForStagingRecord("user-1", "missing-id");
    expect(result.ran).toBe(false);
    expect(result.status).toBe("SKIPPED_NOT_PROJECT");
    expect(runAutoAcceptPilotRealWriteMock).not.toHaveBeenCalled();
  });

  it("8. staging record is not a Project entity — returns SKIPPED_NOT_PROJECT", async () => {
    findUniqueMock.mockResolvedValue({ id: "x", entityType: "Builder", payload: {} });
    const result = await runAutomaticEnrichmentForStagingRecord("user-1", "x");
    expect(result.status).toBe("SKIPPED_NOT_PROJECT");
  });

  it("9. the enrichment engine throwing never propagates — Include's own success must never depend on this", async () => {
    runAutoAcceptPilotRealWriteMock.mockRejectedValue(new Error("network fetch failed"));
    const result = await runAutomaticEnrichmentForStagingRecord("user-1", "staging-1");
    expect(result.ran).toBe(false);
    expect(result.status).toBe("ERROR");
    expect(result.error).toContain("network fetch failed");
  });

  it("10. CONFIRMED fields are no-ops — never counted as accepted, never raise an exception", async () => {
    runAutoAcceptPilotRealWriteMock.mockResolvedValue({
      rows: [row({ classification: "CONFIRMED", decision: "AUTO_ACCEPT", writeOutcome: "SKIPPED_ALREADY_CURRENT" })],
      duplicateUrlWarnings: [],
    });
    const result = await runAutomaticEnrichmentForStagingRecord("user-1", "staging-1");
    expect(result.autoAcceptedCount).toBe(0);
    expect(result.exceptionCount).toBe(0);
    expect(recordFounderExceptionMock).not.toHaveBeenCalled();
  });
});
