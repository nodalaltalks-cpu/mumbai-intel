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

const runAutoAcceptPilotRealWriteMock = vi.fn();
vi.mock("@/lib/actions/autoAcceptPilot", () => ({
  runAutoAcceptPilotRealWrite: (...args: unknown[]) => runAutoAcceptPilotRealWriteMock(...args),
}));

const recordFounderExceptionMock = vi.fn();
const getMostRecentFounderExceptionMock = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/enrichment/founderExceptions", () => ({
  recordFounderException: (...args: unknown[]) => recordFounderExceptionMock(...args),
  getMostRecentFounderException: (...args: unknown[]) => getMostRecentFounderExceptionMock(...args),
}));

import { prisma } from "@/lib/prisma";
import { applyDiscoveryFounderAction, stageDiscoveryBatch, updateDiscoveryCandidateDetails } from "./discovery";
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
const auditCreateMock = vi.mocked(prisma.auditLog.create);

const ANDHERI_WEST_LOCALITY = { id: "loc-andheri-west", name: "Andheri West", aliases: [] };

function discoveryCandidateRecord(overrides: Partial<{ status: string; payload: Partial<ProjectDiscoveryCandidatePayload>; batchId: string }> = {}) {
  return {
    id: "cand-1",
    entityType: DISCOVERY_ENTITY_TYPE,
    batchId: overrides.batchId ?? "batch-discovery-1",
    status: overrides.status ?? "SOURCE_FOUND",
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

  it("Phase 41 Part I — protects against a duplicate already sitting in the Discovery Queue from an earlier batch", async () => {
    stagingFindManyMock.mockImplementation(((args: { where?: { entityType?: string } }) => {
      if (args?.where?.entityType === DISCOVERY_ENTITY_TYPE) {
        return Promise.resolve([{ id: "disc-existing-1", payload: { projectName: "Adani Western Heights" } }]);
      }
      return Promise.resolve([]);
    }) as never);

    const result = await stageDiscoveryBatch({
      batchLabel: "Andheri West — Batch 001",
      localityId: "loc-andheri-west",
      sourceKey: "area-discovery:andheri-west",
      candidates: [
        {
          projectName: "Adani Western Heights",
          developerName: "Adani Realty",
          areaName: "Andheri West",
          sourceUrl: "https://www.adanirealty.com/residential-projects/mumbai/western-heights",
          sourceType: "OFFICIAL_DEVELOPER",
          discoverySource: "adanirealty.com sitemap.xml",
          confidence: "High",
        },
      ],
    });

    expect(result.staged).toBe(1); // still staged as a row -- just correctly labeled, never silently dropped
    const call = stagingCreateMock.mock.calls[0][0].data;
    expect(call.status).toBe("REJECTED_DUPLICATE");
    expect(call.matchedExistingId).toBe("disc-existing-1");
  });

  it("Phase 41 Part I — protects against two near-duplicate candidates submitted in the SAME batch", async () => {
    projectFindManyMock.mockResolvedValue([] as never); // isolate same-batch duplicate detection from the default Godrej live-Project fixture
    const result = await stageDiscoveryBatch({
      batchLabel: "Andheri West — Batch 001",
      localityId: "loc-andheri-west",
      sourceKey: "area-discovery:andheri-west",
      candidates: [
        {
          projectName: "Godrej Sky Shore",
          developerName: "Godrej Properties Ltd.",
          areaName: "Andheri West",
          sourceUrl: "https://example-portal.test/a",
          sourceType: "LISTING_PORTAL",
          discoverySource: "portal A",
          confidence: "Medium",
        },
        {
          projectName: "Godrej Skyshore",
          developerName: "Godrej Properties Ltd.",
          areaName: "Andheri West",
          sourceUrl: "https://example-portal.test/b",
          sourceType: "LISTING_PORTAL",
          discoverySource: "portal B",
          confidence: "Medium",
        },
      ],
    });

    expect(result.staged).toBe(2);
    expect(stagingCreateMock.mock.calls[0][0].data.status).not.toBe("REJECTED_DUPLICATE"); // the first one is genuinely new
    expect(stagingCreateMock.mock.calls[1][0].data.status).toBe("REJECTED_DUPLICATE"); // the second recognizes the first, staged moments earlier
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
    stagingFindManyMock.mockImplementation(((args: { where?: { entityType?: string } }) => {
      if (args?.where?.entityType === "Project") {
        return Promise.resolve([{ id: "existing-staging-1", payload: { name: "Gurukrupa Ekam", localityId: "loc-andheri-west", reraNumber: "PM1180002501525" } }]);
      }
      return Promise.resolve([]);
    }) as never);
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

  it("Phase 42 — accepts a fuzzy (non-exact) SINGLE_MATCH locality, e.g. a real candidate whose areaName is a micro-market-level refinement of the Locality name ('Lokhandwala, Andheri West' for Locality 'Andheri West')", async () => {
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord({ payload: { areaName: "Lokhandwala, Andheri West" } }) as never);
    const result = await applyDiscoveryFounderAction("cand-1", "INCLUDE");
    expect(result.ok).toBe(true);
    expect(stagingCreateMock).toHaveBeenCalledTimes(1);
    const payload = stagingCreateMock.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(payload.localityId).toBe("loc-andheri-west");
  });

  it("Phase 42 — still refuses when the area fuzzy-matches TWO different Locality rows equally well (genuine ambiguity, never guessed)", async () => {
    localityFindManyMock.mockResolvedValue([
      ANDHERI_WEST_LOCALITY,
      { id: "loc-west-andheri-alt", name: "West Andheri", aliases: [] }, // same word set, different order -- neither is an exact match for the candidate below
    ] as never);
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord({ payload: { areaName: "Andheri West Complex" } }) as never);
    const result = await applyDiscoveryFounderAction("cand-1", "INCLUDE");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("MULTIPLE_MATCHES");
    expect(stagingCreateMock).not.toHaveBeenCalled();
  });

  it("13. Phase 43 — THE REAL Kalpataru Vian case: 'Hrushikesh, Lokhandwala, Andheri (W)' now resolves via the real 'Andheri (W)' LocalityAlias, previously blocked in Phase 42", async () => {
    localityFindManyMock.mockResolvedValue([{ id: "loc-andheri-west", name: "Andheri West", aliases: [{ alias: "Andheri (W)" }] }] as never);
    stagingFindUniqueMock.mockResolvedValue(
      discoveryCandidateRecord({ payload: { projectName: "Kalpataru Vian", areaName: "Hrushikesh, Lokhandwala, Andheri (W)" } }) as never
    );
    const result = await applyDiscoveryFounderAction("cand-1", "INCLUDE");
    expect(result.ok).toBe(true);
    const payload = stagingCreateMock.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(payload.localityId).toBe("loc-andheri-west");
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

describe("applyDiscoveryFounderAction — Include triggers automatic enrichment (Phase 69)", () => {
  /**
   * Unlike every other Include test above (which only care that a Project
   * staging record is created and don't care what `stagingFindUniqueMock`
   * returns on a second call), these tests need the SAME mock to answer
   * differently for `loadDiscoveryCandidate`'s own lookup (by the discovery
   * candidate id, "cand-1") vs. the new Project staging record's own lookup
   * (by whatever id `stagingCreateMock` just returned) -- so they key off
   * the real `where.id` instead of a single fixed return value.
   */
  function mockTwoStagingRecords() {
    stagingFindUniqueMock.mockImplementation(((args: unknown) => {
      const id = (args as { where: { id: string } }).where.id;
      if (id === "cand-1") return Promise.resolve(discoveryCandidateRecord());
      if (id === "new-project-staging-1") return Promise.resolve({ id, entityType: "Project", payload: { name: "Gurukrupa Ekam" } });
      return Promise.resolve(null);
    }) as never);
  }

  it("a successful Include immediately runs enrichment against the new staging record and returns its outcome", async () => {
    mockTwoStagingRecords();
    runAutoAcceptPilotRealWriteMock.mockResolvedValue({
      rows: [
        {
          stagingRecordId: "new-project-staging-1",
          projectName: "Gurukrupa Ekam",
          field: "reraNumber",
          currentValue: null,
          proposedValue: "P51800080217",
          confidence: "High",
          classification: "GREEN_NEW",
          tier: "A",
          sourceType: "OFFICIAL_DEVELOPER",
          sourceUrl: "https://gurukruparealcon.com/projects/gurukrupa-ekam",
          decision: "AUTO_ACCEPT",
          reason: "Tier A field, GREEN_NEW, trusted official source.",
          wouldWrite: true,
          writeOutcome: "WRITTEN",
        },
      ],
      duplicateUrlWarnings: [],
    });

    const result = await applyDiscoveryFounderAction("cand-1", "INCLUDE");

    expect(result.ok).toBe(true);
    expect(runAutoAcceptPilotRealWriteMock).toHaveBeenCalledWith([{ id: "new-project-staging-1", name: "Gurukrupa Ekam" }]);
    expect(result.enrichment).toEqual(expect.objectContaining({ ran: true, status: "SUCCESS", autoAcceptedCount: 1, exceptionCount: 0 }));
  });

  it("a CONFLICT field raises a real Founder Exception instead of being written, and Include still succeeds", async () => {
    mockTwoStagingRecords();
    runAutoAcceptPilotRealWriteMock.mockResolvedValue({
      rows: [
        {
          stagingRecordId: "new-project-staging-1",
          projectName: "Gurukrupa Ekam",
          field: "priceMin",
          currentValue: "5.61 Cr",
          proposedValue: "6.10 Cr",
          confidence: "High",
          classification: "CONFLICT",
          tier: "A",
          sourceType: "OFFICIAL_DEVELOPER",
          sourceUrl: "https://gurukruparealcon.com/projects/gurukrupa-ekam",
          decision: "HUMAN_REVIEW",
          reason: "The new source disagrees with the existing value.",
          wouldWrite: false,
          writeOutcome: "SKIPPED_NOT_AUTO_ACCEPT",
        },
      ],
      duplicateUrlWarnings: [],
    });

    const result = await applyDiscoveryFounderAction("cand-1", "INCLUDE");

    expect(result.ok).toBe(true);
    expect(result.enrichment).toEqual(expect.objectContaining({ autoAcceptedCount: 0, exceptionCount: 1 }));
    expect(recordFounderExceptionMock).toHaveBeenCalledWith(
      "user-1",
      "new-project-staging-1",
      "priceMin",
      expect.objectContaining({ reason: "The new source disagrees with the existing value." })
    );
  });

  it("Include still succeeds even if the enrichment engine itself throws", async () => {
    mockTwoStagingRecords();
    runAutoAcceptPilotRealWriteMock.mockRejectedValue(new Error("fetch failed"));

    const result = await applyDiscoveryFounderAction("cand-1", "INCLUDE");

    expect(result.ok).toBe(true);
    expect(result.projectStagingRecordId).toBe("new-project-staging-1");
    expect(result.enrichment?.status).toBe("ERROR");
  });
});

describe("updateDiscoveryCandidateDetails (Phase 59 Part 1 -- founder-editable source/details)", () => {
  it("manually entering a developer official source URL marks officialSourceStatus IDENTIFIED, and never touches the project-specific sourceUrl (Part 1's A/B separation, the real 'Gurukrupa' worked example)", async () => {
    stagingFindUniqueMock.mockResolvedValue(
      discoveryCandidateRecord({ payload: { officialDeveloperUrl: null, officialSourceStatus: "OFFICIAL_SOURCE_UNKNOWN" } }) as never
    );
    const result = await updateDiscoveryCandidateDetails("cand-1", { officialDeveloperUrl: "https://gurukruparealcon.com/" });
    expect(result.ok).toBe(true);
    const written = stagingUpdateMock.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(written.officialDeveloperUrl).toBe("https://gurukruparealcon.com/");
    expect(written.officialSourceStatus).toBe("IDENTIFIED");
    expect(written.sourceUrl).toBe("internal:x"); // unchanged -- a developer homepage is never auto-treated as the project page
  });

  it("editing the project-specific source URL (B) never touches the developer homepage (A)", async () => {
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord() as never);
    const result = await updateDiscoveryCandidateDetails("cand-1", { sourceUrl: "https://gurukruparealcon.com/projects/gurukrupa-darshanam" });
    expect(result.ok).toBe(true);
    const written = stagingUpdateMock.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(written.sourceUrl).toBe("https://gurukruparealcon.com/projects/gurukrupa-darshanam");
    expect(written.officialDeveloperUrl).toBe("https://gurukruparealcon.com"); // unchanged
  });

  it("rejects a project source URL that isn't a full http(s):// URL, and writes nothing", async () => {
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord() as never);
    const result = await updateDiscoveryCandidateDetails("cand-1", { sourceUrl: "gurukruparealcon.com/darshanam" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("http");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects a developer website URL that isn't a full http(s):// URL", async () => {
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord() as never);
    const result = await updateDiscoveryCandidateDetails("cand-1", { officialDeveloperUrl: "not-a-url" });
    expect(result.ok).toBe(false);
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects an empty project name rather than silently clearing it", async () => {
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord() as never);
    const result = await updateDiscoveryCandidateDetails("cand-1", { projectName: "   " });
    expect(result.ok).toBe(false);
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("edits project name, developer, and locality together", async () => {
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord() as never);
    const result = await updateDiscoveryCandidateDetails("cand-1", {
      projectName: "Gurukrupa Darshanam",
      developerName: "Gurukrupa Realcon Pvt. Ltd.",
      areaName: "Vikhroli East",
    });
    expect(result.ok).toBe(true);
    const written = stagingUpdateMock.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(written.projectName).toBe("Gurukrupa Darshanam");
    expect(written.developerName).toBe("Gurukrupa Realcon Pvt. Ltd.");
    expect(written.areaName).toBe("Vikhroli East");
  });

  it("saves a founder status note and a separate founder decision note without mixing the two", async () => {
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord() as never);
    const result = await updateDiscoveryCandidateDetails("cand-1", {
      founderStatusNote: "Confirmed under construction via site visit, Sep 2026",
      founderDecisionNote: "Excluding -- same tower as an already-approved project",
    });
    expect(result.ok).toBe(true);
    const written = stagingUpdateMock.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(written.founderStatusNote).toBe("Confirmed under construction via site visit, Sep 2026");
    expect(written.founderDecisionNote).toBe("Excluding -- same tower as an already-approved project");
  });

  it("records the edit in the existing AuditLog (logAudit) with before/after payload snapshots -- no new audit mechanism", async () => {
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord() as never);
    await updateDiscoveryCandidateDetails("cand-1", { sourceUrl: "https://gurukruparealcon.com/projects/gurukrupa-darshanam" });
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    const call = auditCreateMock.mock.calls[0][0].data as Record<string, unknown>;
    expect(call.action).toBe("discovery.candidate.edit");
    expect(call.entityType).toBe(DISCOVERY_ENTITY_TYPE);
    expect(call.entityId).toBe("cand-1");
    expect((call.before as Record<string, unknown>).sourceUrl).toBe("internal:x");
    expect((call.after as Record<string, unknown>).sourceUrl).toBe("https://gurukruparealcon.com/projects/gurukrupa-darshanam");
  });

  it("returns an error for a non-existent candidate id, and never calls update", async () => {
    stagingFindUniqueMock.mockResolvedValue(null);
    const result = await updateDiscoveryCandidateDetails("missing", { sourceUrl: "https://example.test/x" });
    expect(result.ok).toBe(false);
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("editing details does NOT weaken duplicate detection -- a subsequent Include on the (now-renamed) candidate still runs the same live duplicate check and still refuses a real collision", async () => {
    // The candidate is renamed via the edit action to something that collides with a live Project.
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord({ payload: { projectName: "Godrej Sky Shore" } }) as never);
    projectFindManyMock.mockResolvedValue([{ id: "proj-1", name: "Godrej Sky Shore", localityId: "loc-andheri-west", reraNumber: null }] as never);

    const result = await applyDiscoveryFounderAction("cand-1", "INCLUDE");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("already exists");
    expect(stagingCreateMock).not.toHaveBeenCalled();
  });
});

/**
 * Phase 70 -- regression coverage for the reported "false already-exists
 * error, then the candidate disappears (i.e. Include actually succeeded)"
 * bug. Root cause was entirely client-side (DiscoveryCandidateList.tsx never
 * cleared a PRIOR Include/Exclude/Review error banner when a later edit was
 * saved, so a stale error from an earlier failed attempt stayed visible
 * through a subsequent, genuinely successful Include) -- these tests prove
 * the SERVER side of the sequence was already correct (Include always
 * re-reads the record fresh from the database by id, never from anything
 * the client passes in), which is what makes the client-side fix safe: nothing
 * server-side needed to change to stop weakening duplicate protection.
 */
describe("Phase 70 -- edit-then-Include uses the latest saved state, never stale pre-edit data", () => {
  it("1/4. a candidate renamed away from a real collision succeeds on Include with NO error, using the freshly SAVED name -- not the stale pre-edit one", async () => {
    // Starts out genuinely colliding with a live Project under its ORIGINAL name.
    stagingFindUniqueMock.mockResolvedValueOnce(discoveryCandidateRecord({ payload: { projectName: "Godrej Sky Shore" } }) as never);
    projectFindManyMock.mockResolvedValue([{ id: "proj-1", name: "Godrej Sky Shore", localityId: "loc-andheri-west", reraNumber: null }] as never);

    const editResult = await updateDiscoveryCandidateDetails("cand-1", { projectName: "Godrej Skyline Residences Phase II" });
    expect(editResult.ok).toBe(true);

    // Simulate the database now reflecting the saved edit, exactly what Include's own fresh read sees.
    const savedPayload = stagingUpdateMock.mock.calls[0][0].data.payload as Partial<ProjectDiscoveryCandidatePayload>;
    expect(savedPayload.projectName).toBe("Godrej Skyline Residences Phase II");
    stagingFindUniqueMock.mockResolvedValueOnce(discoveryCandidateRecord({ payload: savedPayload }) as never);

    const includeResult = await applyDiscoveryFounderAction("cand-1", "INCLUDE");
    expect(includeResult.ok).toBe(true);
    expect(includeResult.error).toBeUndefined();
    expect(stagingCreateMock).toHaveBeenCalledTimes(1);
  });

  it("2. a genuine duplicate is still correctly refused even immediately after an unrelated edit -- duplicate protection is not weakened by this fix", async () => {
    stagingFindUniqueMock.mockResolvedValueOnce(discoveryCandidateRecord({ payload: { projectName: "Godrej Sky Shore", founderStatusNote: null } }) as never);
    projectFindManyMock.mockResolvedValue([{ id: "proj-1", name: "Godrej Sky Shore", localityId: "loc-andheri-west", reraNumber: null }] as never);

    // An edit that does NOT resolve the collision (only adds a status note).
    const editResult = await updateDiscoveryCandidateDetails("cand-1", { founderStatusNote: "Confirmed via site visit" });
    expect(editResult.ok).toBe(true);
    const savedPayload = stagingUpdateMock.mock.calls[0][0].data.payload as Partial<ProjectDiscoveryCandidatePayload>;
    stagingFindUniqueMock.mockResolvedValueOnce(discoveryCandidateRecord({ payload: savedPayload }) as never);

    const includeResult = await applyDiscoveryFounderAction("cand-1", "INCLUDE");
    expect(includeResult.ok).toBe(false);
    expect(includeResult.error).toContain("already exists");
    expect(stagingCreateMock).not.toHaveBeenCalled();
  });
});

describe("Phase 59 Part 2 -- a founder decision is never a one-way door", () => {
  it("EXCLUDE -> INCLUDE: a previously-excluded candidate can be included later, once new information appears", async () => {
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord({ status: "EXCLUDED" }) as never);
    const result = await applyDiscoveryFounderAction("cand-1", "INCLUDE");
    expect(result.ok).toBe(true);
    expect(stagingCreateMock).toHaveBeenCalledTimes(1);
    expect(stagingUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PROJECT_STAGED" }) }));
  });

  it("INCLUDE -> EXCLUDE: a candidate already staged as a Project can still be marked Excluded at the discovery-candidate level (the separate Project Review Queue keeps its own independent approve/reject workflow, untouched)", async () => {
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord({ status: "PROJECT_STAGED" }) as never);
    const result = await applyDiscoveryFounderAction("cand-1", "EXCLUDE");
    expect(result.ok).toBe(true);
    expect(stagingUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "EXCLUDED" }) }));
    expect(stagingCreateMock).not.toHaveBeenCalled(); // no second Project staging record created
  });

  it("REVIEW -> INCLUDE: a candidate parked for review can still be included once the founder is confident", async () => {
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord({ status: "NEEDS_REVIEW" }) as never);
    const result = await applyDiscoveryFounderAction("cand-1", "INCLUDE");
    expect(result.ok).toBe(true);
    expect(stagingCreateMock).toHaveBeenCalledTimes(1);
  });

  it("REVIEW -> EXCLUDE: a candidate parked for review can still be excluded", async () => {
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord({ status: "NEEDS_REVIEW" }) as never);
    const result = await applyDiscoveryFounderAction("cand-1", "EXCLUDE");
    expect(result.ok).toBe(true);
    expect(stagingUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "EXCLUDED" }) }));
  });

  it("a changed decision persists exactly as written -- the next read of this same row (what a page reload does) would see the new status, not the old one", async () => {
    stagingFindUniqueMock.mockResolvedValue(discoveryCandidateRecord({ status: "EXCLUDED" }) as never);
    await applyDiscoveryFounderAction("cand-1", "REVIEW");
    const written = stagingUpdateMock.mock.calls[0][0].data as Record<string, unknown>;
    expect(written.status).toBe("NEEDS_REVIEW"); // this is exactly what a subsequent findUnique/page reload would read back
  });
});
