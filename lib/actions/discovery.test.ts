import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({
  requireMutateSession: vi.fn().mockResolvedValue({ userId: "user-1", role: "ADMIN" }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    city: { findUnique: vi.fn() },
    project: { findMany: vi.fn() },
    locality: { findMany: vi.fn() },
    builder: { findMany: vi.fn() },
    ingestBatch: { create: vi.fn(), update: vi.fn() },
    ingestStagingRecord: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/queries", () => ({ PRIMARY_CITY_SLUG: "mumbai" }));

import { prisma } from "@/lib/prisma";
import { applyDiscoveryFounderAction, stageDiscoveryBatch } from "./discovery";
import { DISCOVERY_ENTITY_TYPE } from "@/lib/ingestion/discovery/types";
import type { ProjectDiscoveryCandidatePayload } from "@/lib/ingestion/discovery/types";

const cityFindUniqueMock = vi.mocked(prisma.city.findUnique);
const projectFindManyMock = vi.mocked(prisma.project.findMany);
const localityFindManyMock = vi.mocked(prisma.locality.findMany);
const builderFindManyMock = vi.mocked(prisma.builder.findMany);
const batchCreateMock = vi.mocked(prisma.ingestBatch.create);
const batchUpdateMock = vi.mocked(prisma.ingestBatch.update);
const stagingCreateMock = vi.mocked(prisma.ingestStagingRecord.create);
const stagingFindUniqueMock = vi.mocked(prisma.ingestStagingRecord.findUnique);
const stagingFindManyMock = vi.mocked(prisma.ingestStagingRecord.findMany);
const stagingUpdateMock = vi.mocked(prisma.ingestStagingRecord.update);

const ANDHERI_WEST_LOCALITY = { id: "loc-andheri-west", name: "Andheri West", aliases: [] };

function discoveryCandidateRecord(overrides: Partial<{ status: string; payload: Partial<ProjectDiscoveryCandidatePayload>; batchId: string }> = {}) {
  return {
    id: "cand-1",
    entityType: DISCOVERY_ENTITY_TYPE,
    batchId: "batch-discovery-1",
    status: "SOURCE_FOUND",
    payload: {
      projectName: "Gurukrupa Ekam",
      developerName: "Gurukrupa Realcon",
      areaName: "Andheri West",
      batchLabel: "Andheri West — Batch 001",
      sourceUrl: "internal:x",
      sourceType: "LISTING_PORTAL",
      discoverySource: "existing Project data",
      officialDeveloperUrl: "https://gurukruparealcon.com",
      officialSourceStatus: "IDENTIFIED",
      confidence: "Low",
      duplicateStatus: "NO_MATCH",
      duplicateMatch: null,
      ...overrides.payload,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  cityFindUniqueMock.mockResolvedValue({ id: "city-mumbai" } as never);
  projectFindManyMock.mockResolvedValue([{ id: "proj-godrej", name: "Godrej Sky Shore", localityId: "loc-andheri-west", reraNumber: "PM1180002500076" }] as never);
  localityFindManyMock.mockResolvedValue([ANDHERI_WEST_LOCALITY] as never);
  builderFindManyMock.mockResolvedValue([] as never);
  batchCreateMock.mockResolvedValue({ id: "batch-1" } as never);
  batchUpdateMock.mockResolvedValue({} as never);
  stagingCreateMock.mockResolvedValue({ id: "new-project-staging-1" } as never);
  stagingFindManyMock.mockResolvedValue([] as never);
});

describe("stageDiscoveryBatch (Phase 39)", () => {
  it("writes one IngestStagingRecord per candidate with entityType=ProjectDiscoveryCandidate and never touches the Project table", async () => {
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
      ],
    });

    expect(result.staged).toBe(1);
    expect(stagingCreateMock).toHaveBeenCalledTimes(1);
    expect(stagingCreateMock.mock.calls[0][0].data.entityType).toBe(DISCOVERY_ENTITY_TYPE);
    expect((prisma as unknown as { project: { create?: unknown } }).project.create).toBeUndefined();
  });
});

describe("applyDiscoveryFounderAction — Exclude/Review (Phase 39, unchanged)", () => {
  it("rejects a record whose entityType isn't ProjectDiscoveryCandidate (never accidentally relabels a Project/Builder/etc. staging row)", async () => {
    stagingFindUniqueMock.mockResolvedValue({ id: "rec-1", entityType: "Project", status: "PENDING" } as never);
    const result = await applyDiscoveryFounderAction("rec-1", "INCLUDE");
    expect(result.ok).toBe(false);
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("returns an error for a non-existent record id", async () => {
    stagingFindUniqueMock.mockResolvedValue(null);
    const result = await applyDiscoveryFounderAction("missing", "EXCLUDE");
    expect(result.ok).toBe(false);
  });

  it("Exclude only relabels status -- never touches Project table or reads locality/builder", async () => {
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord() as never);
    const result = await applyDiscoveryFounderAction("cand-1", "EXCLUDE");
    expect(result.ok).toBe(true);
    expect(stagingUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "EXCLUDED" }) }));
    expect(localityFindManyMock).not.toHaveBeenCalled();
    expect(stagingCreateMock).not.toHaveBeenCalled();
  });
});

describe("applyDiscoveryFounderAction — Include (Phase 40 Part B/E)", () => {
  it("1/2. Include with NO_MATCH creates a real Project staging record with the correctly-mapped minimal payload, and marks the candidate PROJECT_STAGED", async () => {
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord() as never);
    const result = await applyDiscoveryFounderAction("cand-1", "INCLUDE");

    expect(result.ok).toBe(true);
    expect(result.projectStagingRecordId).toBe("new-project-staging-1");

    expect(stagingCreateMock).toHaveBeenCalledTimes(1);
    const createCall = stagingCreateMock.mock.calls[0][0].data;
    const payload = createCall.payload as Record<string, unknown>;
    expect(createCall.entityType).toBe("Project");
    expect(createCall.status).toBe("PENDING");
    expect(payload).toEqual(
      expect.objectContaining({
        name: "Gurukrupa Ekam",
        localityId: "loc-andheri-west",
        status: "ANNOUNCED",
        category: "RESIDENTIAL",
        developerGroup: "Gurukrupa Realcon",
        sourceRef: "discovery:cand-1",
      })
    );
    expect(payload.priceMinRupees).toBeUndefined();
    expect(payload.reraNumber).toBeUndefined();

    expect(stagingUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "cand-1" }, data: expect.objectContaining({ status: "PROJECT_STAGED" }) }));
  });

  it("3. CLEAR_ALIAS against the LIVE Project table (identical name, same locality) refuses to stage and marks REJECTED_DUPLICATE", async () => {
    // NOTE (Phase 40 limitation, see final report): the discovery candidate
    // payload never carries a RERA number (Phase 39 never persisted one), so
    // Include can never reach the "EXACT" (rera_number-reason) branch today --
    // an identical name in the same locality instead correctly classifies as
    // CLEAR_ALIAS (name_locality reason, similarity 1.0), which already
    // achieves Part E's real goal: never silently duplicate an existing project.
    projectFindManyMock.mockResolvedValue([{ id: "proj-1", name: "Gurukrupa Ekam", localityId: "loc-andheri-west", reraNumber: "PM1180002501525" }] as never);
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord() as never);

    const result = await applyDiscoveryFounderAction("cand-1", "INCLUDE");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("already exists");
    expect(stagingCreateMock).not.toHaveBeenCalled();
    expect(stagingUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "REJECTED_DUPLICATE" }) }));
  });

  it("4. CLEAR_ALIAS against an already-PENDING 'Project' staging record (the real Gurukrupa Ekam case) refuses to stage a duplicate", async () => {
    stagingFindManyMock.mockResolvedValue([
      { id: "existing-staging-1", payload: { name: "Gurukrupa Ekam", localityId: "loc-andheri-west", reraNumber: "PM1180002501525" } },
    ] as never);
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord() as never);

    const result = await applyDiscoveryFounderAction("cand-1", "INCLUDE");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("existing-staging-1");
    expect(stagingCreateMock).not.toHaveBeenCalled();
    expect(stagingUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "REJECTED_DUPLICATE", matchedExistingId: "existing-staging-1" }) }));
  });

  it("5. AMBIGUOUS match marks NEEDS_REVIEW and refuses to stage, without creating a Project record", async () => {
    // Similarity 0.5 (shared {gurukrupa, ekam} / union {gurukrupa, ekam, phase, two}) -- above the
    // reused matcher's own floor, below the clear-alias threshold -- a genuinely ambiguous case.
    projectFindManyMock.mockResolvedValue([{ id: "proj-1", name: "Gurukrupa Ekam Phase Two", localityId: "loc-andheri-west", reraNumber: null }] as never);
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord() as never);

    const result = await applyDiscoveryFounderAction("cand-1", "INCLUDE");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Ambiguous");
    expect(stagingCreateMock).not.toHaveBeenCalled();
    expect(stagingUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "NEEDS_REVIEW" }) }));
  });

  it("6. NO_MATCH (no collision anywhere) safely creates a new Project staging candidate", async () => {
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord() as never);
    const result = await applyDiscoveryFounderAction("cand-1", "INCLUDE");
    expect(result.ok).toBe(true);
    expect(stagingCreateMock).toHaveBeenCalledTimes(1);
  });

  it("7. required-field safety -- refuses to stage when the area cannot be resolved to exactly one existing locality", async () => {
    localityFindManyMock.mockResolvedValue([] as never); // no localities at all -> NO_MATCH
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord() as never);
    const result = await applyDiscoveryFounderAction("cand-1", "INCLUDE");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("locality");
    expect(stagingCreateMock).not.toHaveBeenCalled();
  });

  it("Include is refused for an already REJECTED_DUPLICATE candidate before any DB read happens", async () => {
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord({ status: "REJECTED_DUPLICATE" }) as never);
    const result = await applyDiscoveryFounderAction("cand-1", "INCLUDE");
    expect(result.ok).toBe(false);
    expect(stagingCreateMock).not.toHaveBeenCalled();
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("resolves an exact-match Builder row into builderId instead of leaving developerGroup as free text", async () => {
    builderFindManyMock.mockResolvedValue([{ id: "builder-gk", name: "Gurukrupa Realcon", legalNames: [], reraNumber: null }] as never);
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord() as never);
    await applyDiscoveryFounderAction("cand-1", "INCLUDE");
    const payload = stagingCreateMock.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(payload.builderId).toBe("builder-gk");
    expect(payload.developerGroup).toBeUndefined();
  });

  it("12/14. never calls approveStagingRecordAction-style writes -- no Project row is ever approved/rejected/modified by Include", async () => {
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord() as never);
    await applyDiscoveryFounderAction("cand-1", "INCLUDE");
    expect((prisma as unknown as { project: { update?: unknown; create?: unknown } }).project.update).toBeUndefined();
    expect((prisma as unknown as { project: { update?: unknown; create?: unknown } }).project.create).toBeUndefined();
  });
});
