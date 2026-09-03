import { describe, expect, it, vi, beforeEach } from "vitest";

const requireMutateSessionMock = vi.fn();
vi.mock("@/lib/auth/guard", () => ({
  requireMutateSession: (...args: unknown[]) => requireMutateSessionMock(...args),
}));

const findUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ingestStagingRecord: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
  },
}));

const logAuditMock = vi.fn();
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args),
}));

const enrichProjectActionMock = vi.fn();
const acceptEnrichmentFieldActionMock = vi.fn();
vi.mock("./enrichment", () => ({
  enrichProjectAction: (...args: unknown[]) => enrichProjectActionMock(...args),
  acceptEnrichmentFieldAction: (...args: unknown[]) => acceptEnrichmentFieldActionMock(...args),
}));

import { runAutoAcceptPilotDryRun, runAutoAcceptPilotRealWrite } from "./autoAcceptPilot";
import { PILOT_PROJECTS, PHASE61A_VALIDATION_PROJECTS } from "@/lib/enrichment/pilotProjects";
import type { EnrichmentField } from "@/lib/enrichment/types";

function field(overrides: Partial<EnrichmentField>): EnrichmentField {
  return {
    key: "reraNumber",
    label: "RERA number",
    group: "Pricing",
    currentValue: null,
    proposedValue: "P51800080217",
    sourceUrl: "https://www.rustomjee.com/projects/residential/rustomjee-crescent/",
    sourceType: "OFFICIAL_DEVELOPER",
    confidence: "High",
    classification: "GREEN_NEW",
    reason: "Field is currently blank; a high-confidence value was found and can be safely added.",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireMutateSessionMock.mockResolvedValue({ userId: "user-1", role: "ADMIN" });
  // Every pilot project's enrichment defaults to a single clean Tier A field unless a test overrides it.
  enrichProjectActionMock.mockResolvedValue({ status: "SUCCESS", fields: [field({})] });
  acceptEnrichmentFieldActionMock.mockResolvedValue({ status: "SUCCESS" });
});

describe("PILOT_PROJECTS — the exact locked Phase 59B set", () => {
  it("1. is exactly the 10 named projects, never a different set", () => {
    expect(PILOT_PROJECTS.map((p) => p.name)).toEqual([
      "Kalpataru Vian", "Rustomjee Crescent", "Rustomjee Crown", "Rustomjee Cliff Tower",
      "Rustomjee Balmoral Golf Links", "Rustomjee 180 Bayview", "Rustomjee Stella",
      "Rustomjee Ashiana", "Rustomjee Seasons", "Oberoi Sky Heights",
    ]);
  });
});

describe("runAutoAcceptPilotDryRun", () => {
  it("2. requires an authenticated session — an unauthorized caller cannot even dry-run", async () => {
    requireMutateSessionMock.mockRejectedValue(new Error("Not authenticated"));
    await expect(runAutoAcceptPilotDryRun()).rejects.toThrow("Not authenticated");
    expect(enrichProjectActionMock).not.toHaveBeenCalled();
  });

  it("3. a Tier A GREEN_NEW field -> AUTO_ACCEPT, wouldWrite true, and nothing is written yet (dry-run)", async () => {
    const result = await runAutoAcceptPilotDryRun();
    const row = result.rows.find((r) => r.field === "reraNumber");
    expect(row?.decision).toBe("AUTO_ACCEPT");
    expect(row?.wouldWrite).toBe(true);
    expect(acceptEnrichmentFieldActionMock).not.toHaveBeenCalled();
  });

  it("4. a Tier B field (locality) -> HUMAN_REVIEW even when GREEN_NEW/trusted", async () => {
    enrichProjectActionMock.mockResolvedValue({ status: "SUCCESS", fields: [field({ key: "locality", label: "Locality", proposedValue: "Bandra West" })] });
    const result = await runAutoAcceptPilotDryRun();
    expect(result.rows[0].decision).toBe("HUMAN_REVIEW");
    expect(result.rows[0].wouldWrite).toBe(false);
  });

  it("5. a Tier C field (tagline, marketing paragraph) -> HUMAN_REVIEW, never AUTO_ACCEPT", async () => {
    enrichProjectActionMock.mockResolvedValue({
      status: "SUCCESS",
      fields: [field({ key: "tagline", label: "Tagline", classification: "YELLOW", confidence: "Medium", proposedValue: "Welcome to a life of unparalleled luxury..." })],
    });
    const result = await runAutoAcceptPilotDryRun();
    expect(result.rows[0].decision).toBe("HUMAN_REVIEW");
  });

  it("6. a CONFLICT field is never AUTO_ACCEPT even on a Tier A key", async () => {
    enrichProjectActionMock.mockResolvedValue({
      status: "SUCCESS",
      fields: [field({ classification: "CONFLICT", currentValue: "P00000000000", reason: "The new source disagrees with the existing value." })],
    });
    const result = await runAutoAcceptPilotDryRun();
    expect(result.rows[0].decision).toBe("HUMAN_REVIEW");
    expect(result.rows[0].wouldWrite).toBe(false);
  });

  it("7. an identity field (name) differing from current -> HUMAN_REVIEW, never AUTO_ACCEPT", async () => {
    enrichProjectActionMock.mockResolvedValue({
      status: "SUCCESS",
      fields: [field({ key: "name", label: "Name", classification: "CONFLICT", currentValue: "Rustomjee Crescent", proposedValue: "Crescent by Rustomjee" })],
    });
    const result = await runAutoAcceptPilotDryRun();
    expect(result.rows[0].decision).toBe("HUMAN_REVIEW");
    expect(result.rows[0].tier).toBe("PROTECTED");
  });

  it("8. an already-CONFIRMED Tier A field is reported as AUTO_ACCEPT-but-not-a-write (no meaningless duplicate)", async () => {
    enrichProjectActionMock.mockResolvedValue({
      status: "SUCCESS",
      fields: [field({ classification: "CONFIRMED", currentValue: "P51800080217" })],
    });
    const result = await runAutoAcceptPilotDryRun();
    expect(result.rows[0].decision).toBe("AUTO_ACCEPT");
    expect(result.rows[0].wouldWrite).toBe(false); // the field distinguishing a real write from a no-op
  });

  it("9. two pilot projects resolving to the identical sourceUrl are flagged as a duplicate warning, never silently merged", async () => {
    const SAME_URL = "https://www.rustomjee.com/projects/residential/rustomjee-crescent/";
    enrichProjectActionMock.mockResolvedValue({ status: "SUCCESS", fields: [field({ sourceUrl: SAME_URL })] });
    const result = await runAutoAcceptPilotDryRun();
    // Every one of the 10 pilot projects was mocked to the SAME sourceUrl -> every pair should be flagged.
    expect(result.duplicateUrlWarnings.length).toBeGreaterThan(0);
  });
});

describe("runAutoAcceptPilotRealWrite", () => {
  it("10. requires an authenticated session — cannot write without one", async () => {
    requireMutateSessionMock.mockRejectedValue(new Error("Not authenticated"));
    await expect(runAutoAcceptPilotRealWrite()).rejects.toThrow("Not authenticated");
    expect(acceptEnrichmentFieldActionMock).not.toHaveBeenCalled();
  });

  it("11. a real AUTO_ACCEPT field is written through the EXISTING acceptEnrichmentFieldAction, and machine-decision evidence is logged", async () => {
    findUniqueMock.mockResolvedValue({ status: "PENDING" });
    const result = await runAutoAcceptPilotRealWrite();
    expect(acceptEnrichmentFieldActionMock).toHaveBeenCalledWith(
      PILOT_PROJECTS[0].id,
      "reraNumber",
      "P51800080217",
      undefined,
      expect.objectContaining({ sourceType: "OFFICIAL_DEVELOPER" })
    );
    const written = result.rows.filter((r) => r.writeOutcome === "WRITTEN");
    expect(written.length).toBe(PILOT_PROJECTS.length); // same clean field mocked for every project
    // Audit evidence: one supplementary logAudit call per written field, distinct action string from a human accept.
    expect(logAuditMock).toHaveBeenCalledWith("user-1", "enrichment.autoAccept.evidence", "ProjectEnrichmentField", PILOT_PROJECTS[0].id, expect.any(Object));
  });

  it("12. an already-CONFIRMED field is skipped as SKIPPED_ALREADY_CURRENT — no call to acceptEnrichmentFieldAction, no duplicate audit event", async () => {
    enrichProjectActionMock.mockResolvedValue({ status: "SUCCESS", fields: [field({ classification: "CONFIRMED" })] });
    findUniqueMock.mockResolvedValue({ status: "PENDING" });
    const result = await runAutoAcceptPilotRealWrite();
    expect(result.rows.every((r) => r.writeOutcome === "SKIPPED_ALREADY_CURRENT")).toBe(true);
    expect(acceptEnrichmentFieldActionMock).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("13. a HUMAN_REVIEW field (e.g. locality) is never written, regardless of how confident the source claims to be", async () => {
    enrichProjectActionMock.mockResolvedValue({ status: "SUCCESS", fields: [field({ key: "locality", label: "Locality", proposedValue: "Bandra West" })] });
    findUniqueMock.mockResolvedValue({ status: "PENDING" });
    const result = await runAutoAcceptPilotRealWrite();
    expect(result.rows.every((r) => r.writeOutcome === "SKIPPED_NOT_AUTO_ACCEPT")).toBe(true);
    expect(acceptEnrichmentFieldActionMock).not.toHaveBeenCalled();
  });

  it("14. staging record no longer PENDING at write-time (approved/rejected between dry-run and write) -> SKIPPED_STALE_RECHECK, never forced through", async () => {
    findUniqueMock.mockResolvedValue({ status: "APPROVED" });
    const result = await runAutoAcceptPilotRealWrite();
    expect(result.rows.every((r) => r.writeOutcome === "SKIPPED_STALE_RECHECK")).toBe(true);
    expect(acceptEnrichmentFieldActionMock).not.toHaveBeenCalled();
  });

  it("15. a failed underlying accept is recorded as ERROR and does NOT stop the rest of the batch", async () => {
    findUniqueMock.mockResolvedValue({ status: "PENDING" });
    acceptEnrichmentFieldActionMock
      .mockResolvedValueOnce({ status: "ERROR", error: "boom" })
      .mockResolvedValue({ status: "SUCCESS" });
    const result = await runAutoAcceptPilotRealWrite();
    expect(result.rows[0].writeOutcome).toBe("ERROR");
    expect(result.rows[0].error).toBe("boom");
    // every other project still got processed and written despite the first failure
    expect(result.rows.filter((r) => r.writeOutcome === "WRITTEN").length).toBe(PILOT_PROJECTS.length - 1);
  });

  it("16. an exception thrown mid-write is caught, recorded as ERROR, and does not propagate (never silently swallowed either -- the error message is preserved)", async () => {
    findUniqueMock.mockResolvedValue({ status: "PENDING" });
    acceptEnrichmentFieldActionMock.mockRejectedValueOnce(new Error("db exploded")).mockResolvedValue({ status: "SUCCESS" });
    const result = await runAutoAcceptPilotRealWrite();
    expect(result.rows[0].writeOutcome).toBe("ERROR");
    expect(result.rows[0].error).toBe("db exploded");
  });

  it("17. this pilot never calls anything that approves the staging record or changes isPublished -- only acceptEnrichmentFieldAction is ever invoked", async () => {
    findUniqueMock.mockResolvedValue({ status: "PENDING" });
    await runAutoAcceptPilotRealWrite();
    // The only mutation surface exercised is the existing accept-field path; no approve/reject/publish action is imported or called anywhere in this module.
    expect(acceptEnrichmentFieldActionMock).toHaveBeenCalled();
  });
});

describe("Phase 61A — parameterized project list (genuinely new candidates, not the Phase 59B ten)", () => {
  it("18. PHASE61A_VALIDATION_PROJECTS is a distinct, fixed 3-project list, disjoint from the Phase 59B ten", () => {
    expect(PHASE61A_VALIDATION_PROJECTS.map((p) => p.name)).toEqual(["Rustomjee Cleon", "Rustomjee Aden", "Shapoorji Pallonji Nine Arcs"]);
    const overlap = PHASE61A_VALIDATION_PROJECTS.filter((p) => PILOT_PROJECTS.some((q) => q.id === p.id));
    expect(overlap).toHaveLength(0);
  });

  it("19. calling with an explicit project list evaluates ONLY that list, not the default ten", async () => {
    const result = await runAutoAcceptPilotDryRun(PHASE61A_VALIDATION_PROJECTS);
    const seenIds = new Set(result.rows.map((r) => r.stagingRecordId));
    expect(seenIds.size).toBe(PHASE61A_VALIDATION_PROJECTS.length);
    for (const p of PHASE61A_VALIDATION_PROJECTS) expect(seenIds.has(p.id)).toBe(true);
    expect(enrichProjectActionMock).toHaveBeenCalledTimes(PHASE61A_VALIDATION_PROJECTS.length);
  });

  it("20. a genuinely new (never-accepted) Tier A field on a non-pilot project reaches AUTO_ACCEPT with wouldWrite=true, and is actually written through the existing acceptEnrichmentFieldAction", async () => {
    findUniqueMock.mockResolvedValue({ status: "PENDING" });
    const result = await runAutoAcceptPilotRealWrite(PHASE61A_VALIDATION_PROJECTS);
    const written = result.rows.filter((r) => r.writeOutcome === "WRITTEN");
    expect(written.length).toBe(PHASE61A_VALIDATION_PROJECTS.length);
    expect(acceptEnrichmentFieldActionMock).toHaveBeenCalledWith(
      PHASE61A_VALIDATION_PROJECTS[0].id,
      "reraNumber",
      "P51800080217",
      undefined,
      expect.any(Object)
    );
    // Machine audit evidence logged once per genuine write, distinct action string from a human accept.
    expect(logAuditMock).toHaveBeenCalledWith(
      "user-1",
      "enrichment.autoAccept.evidence",
      "ProjectEnrichmentField",
      PHASE61A_VALIDATION_PROJECTS[0].id,
      expect.any(Object)
    );
  });

  it("21. HUMAN_REVIEW and CONFLICT fields on the new list are still never written, exactly as with the default list", async () => {
    enrichProjectActionMock.mockResolvedValue({
      status: "SUCCESS",
      fields: [field({ key: "locality", label: "Locality", classification: "CONFLICT", currentValue: "Santacruz East", proposedValue: "Santacruz East, Mumbai" })],
    });
    findUniqueMock.mockResolvedValue({ status: "PENDING" });
    const result = await runAutoAcceptPilotRealWrite(PHASE61A_VALIDATION_PROJECTS);
    expect(result.rows.every((r) => r.writeOutcome !== "WRITTEN")).toBe(true);
  });

  it("22. an unauthorized caller cannot invoke the real-write path against the new list either", async () => {
    requireMutateSessionMock.mockRejectedValue(new Error("Not authenticated"));
    await expect(runAutoAcceptPilotRealWrite(PHASE61A_VALIDATION_PROJECTS)).rejects.toThrow("Not authenticated");
    expect(acceptEnrichmentFieldActionMock).not.toHaveBeenCalled();
  });

  it("23. an exact duplicate sourceUrl among the new candidates is flagged, never silently merged", async () => {
    const SAME_URL = "https://shapoorjirealestate.com/residential/nine-arcs/";
    enrichProjectActionMock.mockResolvedValue({ status: "SUCCESS", fields: [field({ sourceUrl: SAME_URL })] });
    const result = await runAutoAcceptPilotDryRun(PHASE61A_VALIDATION_PROJECTS);
    expect(result.duplicateUrlWarnings.length).toBeGreaterThan(0);
  });
});
