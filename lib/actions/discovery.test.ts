import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({
  requireMutateSession: vi.fn().mockResolvedValue({ userId: "user-1", role: "ADMIN" }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    city: { findUnique: vi.fn() },
    project: { findMany: vi.fn() },
    ingestBatch: { create: vi.fn(), update: vi.fn() },
    ingestStagingRecord: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/queries", () => ({ PRIMARY_CITY_SLUG: "mumbai" }));

import { prisma } from "@/lib/prisma";
import { applyDiscoveryFounderAction, stageDiscoveryBatch } from "./discovery";
import { DISCOVERY_ENTITY_TYPE } from "@/lib/ingestion/discovery/types";

const cityFindUniqueMock = vi.mocked(prisma.city.findUnique);
const projectFindManyMock = vi.mocked(prisma.project.findMany);
const batchCreateMock = vi.mocked(prisma.ingestBatch.create);
const batchUpdateMock = vi.mocked(prisma.ingestBatch.update);
const stagingCreateMock = vi.mocked(prisma.ingestStagingRecord.create);
const stagingFindUniqueMock = vi.mocked(prisma.ingestStagingRecord.findUnique);
const stagingUpdateMock = vi.mocked(prisma.ingestStagingRecord.update);

beforeEach(() => {
  vi.clearAllMocks();
  cityFindUniqueMock.mockResolvedValue({ id: "city-mumbai" } as never);
  projectFindManyMock.mockResolvedValue([{ id: "proj-godrej", name: "Godrej Sky Shore", localityId: "loc-andheri-west", reraNumber: "PM1180002500076" }] as never);
  batchCreateMock.mockResolvedValue({ id: "batch-1" } as never);
  batchUpdateMock.mockResolvedValue({} as never);
  stagingCreateMock.mockResolvedValue({} as never);
});

describe("stageDiscoveryBatch (Phase 39)", () => {
  it("17. writes one IngestStagingRecord per candidate with entityType=ProjectDiscoveryCandidate and never touches the Project table", async () => {
    const result = await stageDiscoveryBatch({
      batchLabel: "Andheri West — Batch 001",
      localityId: "loc-andheri-west",
      sourceKey: "area-discovery:andheri-west",
      candidates: [
        {
          projectName: "Kalpataru Vian",
          developerName: "Kalpataru Limited",
          areaName: "Andheri West",
          sourceUrl: "https://www.kalpataru.com/mumbai/kalpataru-vian",
          sourceType: "OFFICIAL_DEVELOPER",
          discoverySource: "kalpataru.com sitemap.xml",
          confidence: "High",
        },
        {
          projectName: "Godrej Skyshore",
          developerName: "Godrej Properties Ltd.",
          areaName: "Andheri West",
          sourceUrl: "https://example-portal.test/godrej-skyshore",
          sourceType: "LISTING_PORTAL",
          discoverySource: "existing Project data",
          confidence: "Medium",
        },
      ],
    });

    expect(result.staged).toBe(2);
    expect(result.failed).toBe(0);
    expect(stagingCreateMock).toHaveBeenCalledTimes(2);
    for (const call of stagingCreateMock.mock.calls) {
      expect(call[0].data.entityType).toBe(DISCOVERY_ENTITY_TYPE);
    }
    expect(prisma.project.findMany).toHaveBeenCalled();
    expect((prisma as unknown as { project: { create?: unknown } }).project.create).toBeUndefined();
  });

  it("18. a duplicate candidate (Godrej Skyshore alias) is staged as REJECTED_DUPLICATE with matchedExistingId set", async () => {
    await stageDiscoveryBatch({
      batchLabel: "Andheri West — Batch 001",
      localityId: "loc-andheri-west",
      sourceKey: "area-discovery:andheri-west",
      candidates: [
        {
          projectName: "Godrej Skyshore",
          developerName: "Godrej Properties Ltd.",
          areaName: "Andheri West",
          sourceUrl: "https://example-portal.test/godrej-skyshore",
          sourceType: "LISTING_PORTAL",
          discoverySource: "existing Project data",
          confidence: "Medium",
        },
      ],
    });
    const call = stagingCreateMock.mock.calls[0][0].data;
    expect(call.status).toBe("REJECTED_DUPLICATE");
    expect(call.matchedExistingId).toBe("proj-godrej");
  });
});

describe("applyDiscoveryFounderAction (Phase 39 Part I)", () => {
  it("19. rejects a record whose entityType isn't ProjectDiscoveryCandidate (never accidentally relabels a Project/Builder/etc. staging row)", async () => {
    stagingFindUniqueMock.mockResolvedValue({ id: "rec-1", entityType: "Project", status: "PENDING" } as never);
    const result = await applyDiscoveryFounderAction("rec-1", "INCLUDE");
    expect(result.ok).toBe(false);
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("20. Include succeeds for a SOURCE_FOUND candidate and updates status to READY_FOR_ENRICHMENT", async () => {
    stagingFindUniqueMock.mockResolvedValue({ id: "rec-2", entityType: DISCOVERY_ENTITY_TYPE, status: "SOURCE_FOUND" } as never);
    const result = await applyDiscoveryFounderAction("rec-2", "INCLUDE");
    expect(result.ok).toBe(true);
    expect(stagingUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "rec-2" }, data: expect.objectContaining({ status: "READY_FOR_ENRICHMENT" }) }));
  });

  it("21. Include is refused for a REJECTED_DUPLICATE candidate, and no update is written", async () => {
    stagingFindUniqueMock.mockResolvedValue({ id: "rec-3", entityType: DISCOVERY_ENTITY_TYPE, status: "REJECTED_DUPLICATE" } as never);
    const result = await applyDiscoveryFounderAction("rec-3", "INCLUDE");
    expect(result.ok).toBe(false);
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("22. returns an error for a non-existent record id", async () => {
    stagingFindUniqueMock.mockResolvedValue(null);
    const result = await applyDiscoveryFounderAction("missing", "EXCLUDE");
    expect(result.ok).toBe(false);
  });
});
