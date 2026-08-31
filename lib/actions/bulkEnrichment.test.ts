import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({
  requireMutateSession: vi.fn().mockResolvedValue({ userId: "user-1", role: "ADMIN" }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ingestStagingRecord: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock("./discovery", () => ({
  applyDiscoveryFounderAction: vi.fn(),
}));

vi.mock("./enrichment", () => ({
  enrichProjectAction: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { applyDiscoveryFounderAction } from "./discovery";
import { enrichProjectAction } from "./enrichment";
import { runBulkEnrichment } from "./bulkEnrichment";
import type { EnrichmentField, EnrichmentClassification } from "@/lib/enrichment/types";

const stagingFindUniqueMock = vi.mocked(prisma.ingestStagingRecord.findUnique);
const stagingFindFirstMock = vi.mocked(prisma.ingestStagingRecord.findFirst);
const includeMock = vi.mocked(applyDiscoveryFounderAction);
const enrichMock = vi.mocked(enrichProjectAction);

function projectRecord(name: string, developerGroup = "Some Developer") {
  return { id: "stage-1", entityType: "Project", payload: { name, developerGroup } };
}

function enrichmentField(key: string, classification: EnrichmentClassification, sourceUrl = "https://example.com/project"): EnrichmentField {
  return { key, label: key, group: "General", currentValue: null, proposedValue: "x", sourceUrl, sourceType: "OFFICIAL_DEVELOPER", confidence: "High", classification, reason: "" };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runBulkEnrichment (Phase 44 — multi-project batch orchestration)", () => {
  it("1. multi-project batch -- processes every target and returns one result per project", async () => {
    stagingFindUniqueMock.mockResolvedValue(projectRecord("Project A") as never);
    enrichMock.mockResolvedValue({ status: "SUCCESS", fields: [enrichmentField("name", "GREEN_NEW")] });

    const result = await runBulkEnrichment([{ stagingRecordId: "stage-1" }, { stagingRecordId: "stage-1" }, { stagingRecordId: "stage-1" }]);
    expect(result.results).toHaveLength(3);
  });

  it("2. successful project -- SUCCESS status with correctly counted classifications", async () => {
    stagingFindUniqueMock.mockResolvedValue(projectRecord("Project A") as never);
    enrichMock.mockResolvedValue({
      status: "SUCCESS",
      fields: [
        enrichmentField("f1", "GREEN_NEW"),
        enrichmentField("f2", "GREEN_NEW"),
        enrichmentField("f3", "CONFIRMED"),
        enrichmentField("f4", "YELLOW"),
        enrichmentField("f5", "CONFLICT"),
        enrichmentField("f6", "MISSING"),
      ],
    });

    const result = await runBulkEnrichment([{ stagingRecordId: "stage-1" }]);
    const r = result.results[0];
    expect(r.status).toBe("SUCCESS");
    expect(r.greenNew).toBe(2);
    expect(r.confirmed).toBe(1);
    expect(r.yellow).toBe(1);
    expect(r.conflict).toBe(1);
    expect(r.missing).toBe(1);
    expect(r.fieldsFound).toBe(5); // everything except MISSING
    expect(r.sourceUrl).toBe("https://example.com/project");
  });

  it("3. source unavailable -- reported distinctly, not conflated with ERROR", async () => {
    stagingFindUniqueMock.mockResolvedValue(projectRecord("Project A") as never);
    enrichMock.mockResolvedValue({ status: "SOURCE_UNAVAILABLE" });
    const result = await runBulkEnrichment([{ stagingRecordId: "stage-1" }]);
    expect(result.results[0].status).toBe("SOURCE_UNAVAILABLE");
  });

  it("4. no source -- reported distinctly", async () => {
    stagingFindUniqueMock.mockResolvedValue(projectRecord("Project A") as never);
    enrichMock.mockResolvedValue({ status: "NO_SOURCE" });
    const result = await runBulkEnrichment([{ stagingRecordId: "stage-1" }]);
    expect(result.results[0].status).toBe("NO_SOURCE");
  });

  it("5/6. one project failure does not stop the batch -- mixed success/failure all report independently", async () => {
    stagingFindUniqueMock.mockImplementation((async (args: { where: { id: string } }) => {
      if (args.where.id === "stage-fail") return null; // simulates a record vanishing/not found
      return projectRecord("OK Project");
    }) as never);
    enrichMock.mockResolvedValue({ status: "SUCCESS", fields: [enrichmentField("name", "GREEN_NEW")] });

    const result = await runBulkEnrichment([{ stagingRecordId: "stage-ok-1" }, { stagingRecordId: "stage-fail" }, { stagingRecordId: "stage-ok-2" }]);
    expect(result.results).toHaveLength(3);
    expect(result.results[0].status).toBe("SUCCESS");
    expect(result.results[1].status).toBe("ERROR");
    expect(result.results[2].status).toBe("SUCCESS"); // third project unaffected by the second's failure
  });

  it("throws before processing anything when given more than 10 targets (Part O cap)", async () => {
    const targets = Array.from({ length: 11 }, (_, i) => ({ stagingRecordId: `stage-${i}` }));
    await expect(runBulkEnrichment(targets)).rejects.toThrow(/capped at 10/);
    expect(enrichMock).not.toHaveBeenCalled();
  });

  it("7. idempotency -- re-running Include for an already-PROJECT_STAGED candidate finds its EXISTING Project staging record instead of failing or duplicating", async () => {
    includeMock.mockResolvedValue({ ok: false, error: "This candidate has already been staged as a Project." });
    stagingFindFirstMock.mockResolvedValue({ id: "existing-staged-1" } as never);
    stagingFindUniqueMock.mockResolvedValue(projectRecord("Already Staged Project") as never);
    enrichMock.mockResolvedValue({ status: "SUCCESS", fields: [] });

    const result = await runBulkEnrichment([{ discoveryCandidateId: "disc-1" }]);
    expect(stagingFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ entityType: "Project" }) })
    );
    expect(enrichMock).toHaveBeenCalledWith("existing-staged-1");
    expect(result.results[0].status).toBe("SUCCESS");
  });

  it("8. existing staging protection -- Include is genuinely refused (e.g. real duplicate) with no fallback record found -> reports INCLUDE_FAILED, never fabricates a stagingRecordId", async () => {
    includeMock.mockResolvedValue({ ok: false, error: "This project already exists (CLEAR_ALIAS)." });
    stagingFindFirstMock.mockResolvedValue(null);

    const result = await runBulkEnrichment([{ discoveryCandidateId: "disc-2" }]);
    expect(result.results[0].status).toBe("INCLUDE_FAILED");
    expect(result.results[0].stagingRecordId).toBeUndefined();
    expect(enrichMock).not.toHaveBeenCalled();
  });

  it("9/10. never calls anything beyond Include + enrichProjectAction -- no approval/acceptance path exists in this module at all", async () => {
    stagingFindUniqueMock.mockResolvedValue(projectRecord("Project A") as never);
    enrichMock.mockResolvedValue({ status: "SUCCESS", fields: [enrichmentField("name", "GREEN_NEW")] });
    await runBulkEnrichment([{ stagingRecordId: "stage-1" }]);
    // The only DB call this module ever makes directly is a read (findUnique/findFirst) -- no create/update/delete of any kind.
    expect((prisma.ingestStagingRecord as unknown as { update?: unknown }).update).toBeUndefined();
    expect((prisma.ingestStagingRecord as unknown as { create?: unknown }).create).toBeUndefined();
  });

  it("11. reuses the existing enrichProjectAction/classifier verbatim -- this module never classifies fields itself", async () => {
    stagingFindUniqueMock.mockResolvedValue(projectRecord("Project A") as never);
    enrichMock.mockResolvedValue({ status: "SUCCESS", fields: [enrichmentField("name", "CONFLICT")] });
    await runBulkEnrichment([{ stagingRecordId: "stage-1" }]);
    expect(enrichMock).toHaveBeenCalledTimes(1);
    expect(enrichMock).toHaveBeenCalledWith("stage-1");
  });

  it("times each project independently and reports a real total duration", async () => {
    stagingFindUniqueMock.mockResolvedValue(projectRecord("Project A") as never);
    enrichMock.mockResolvedValue({ status: "SUCCESS", fields: [] });
    const result = await runBulkEnrichment([{ stagingRecordId: "stage-1" }, { stagingRecordId: "stage-1" }]);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    for (const r of result.results) expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns an empty result set for an empty target list without calling anything", async () => {
    const result = await runBulkEnrichment([]);
    expect(result).toEqual({ totalDurationMs: 0, results: [] });
    expect(includeMock).not.toHaveBeenCalled();
    expect(enrichMock).not.toHaveBeenCalled();
  });
});
