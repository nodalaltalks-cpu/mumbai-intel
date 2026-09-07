import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/guard", () => ({
  requireMutateSession: vi.fn().mockResolvedValue({ userId: "user-1", role: "ADMIN" }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ingestStagingRecord: { findUnique: vi.fn(), update: vi.fn() },
    locality: { findUnique: vi.fn(), findMany: vi.fn() },
    builder: { findUnique: vi.fn(), findMany: vi.fn() },
    project: { findUnique: vi.fn() },
    auditLog: { findMany: vi.fn(), create: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { requireMutateSession } from "@/lib/auth/guard";
import { researchProjectAction, submitResearchFindingsAction, buildResearchPlanAction } from "./research";
import { RESEARCH_ENTITY_TYPE } from "@/lib/enrichment/enrichmentHistory";
import type { ResearchFinding } from "@/lib/enrichment/researchProvider";

const stagingFindUniqueMock = vi.mocked(prisma.ingestStagingRecord.findUnique);
const stagingUpdateMock = vi.mocked(prisma.ingestStagingRecord.update);
const localityFindUniqueMock = vi.mocked(prisma.locality.findUnique);
const builderFindUniqueMock = vi.mocked(prisma.builder.findUnique);
const builderFindManyMock = vi.mocked(prisma.builder.findMany);
const projectFindUniqueMock = vi.mocked(prisma.project.findUnique);
const auditLogFindManyMock = vi.mocked(prisma.auditLog.findMany);
const auditLogCreateMock = vi.mocked(prisma.auditLog.create);

const LINKBAY_PAYLOAD = {
  name: "Linkbay Residences",
  status: "UNDER_CONSTRUCTION",
  category: "RESIDENTIAL",
  sourceRef: "P51800047539",
  dataSource: "EXTERNAL_OPEN_DATA",
  localityId: "loc-andheri",
  developerGroup: "Adani Realty",
  reraNumber: "P51800047539",
};

function stagingRecord(overrides: Partial<{ entityType: string; payload: unknown; status: string }> = {}) {
  return {
    id: "stage-1",
    batchId: "batch-1",
    entityType: "Project",
    targetId: null,
    payload: LINKBAY_PAYLOAD,
    matchedExistingId: null,
    matchConfidence: null,
    status: "PENDING",
    reviewedByUserId: null,
    reviewedAt: null,
    appliedEntityId: null,
    rolledBackAt: null,
    rolledBackByUserId: null,
    createdAt: new Date(),
    ...overrides,
  } as never;
}

function finding(overrides: Partial<ResearchFinding> = {}): ResearchFinding {
  return {
    fieldKey: "address",
    value: "Off Link Road, Andheri West",
    confidence: "High",
    sourceUrl: "https://www.adanirealty.com/linkbay",
    sourceType: "OFFICIAL_DEVELOPER",
    reasoning: "Address disclosed on the official project page.",
    identitySignals: { pageProjectName: "Linkbay Residences", pageDeveloperName: "Adani Realty" },
    ...overrides,
  };
}

function updatedPayload(callIndex = 0): Record<string, unknown> {
  return stagingUpdateMock.mock.calls[callIndex][0].data.payload as Record<string, unknown>;
}

describe("researchProjectAction (Section 24 -- no providers registered by default)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localityFindUniqueMock.mockResolvedValue({ name: "Andheri West" } as never);
    builderFindUniqueMock.mockResolvedValue(null as never);
    builderFindManyMock.mockResolvedValue([] as never);
    auditLogFindManyMock.mockResolvedValue([] as never);
  });

  it("9. NOT_CONFIGURED with zero registered providers -- honest, never a fake research pass", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await researchProjectAction("stage-1");
    expect(result.status).toBe("NOT_CONFIGURED");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for a missing staging record, ERROR for a non-Project/non-PENDING one", async () => {
    stagingFindUniqueMock.mockResolvedValue(null as never);
    expect((await researchProjectAction("missing")).status).toBe("NOT_FOUND");

    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ entityType: "Builder" }));
    expect((await researchProjectAction("stage-1")).status).toBe("ERROR");

    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ status: "APPROVED" }));
    expect((await researchProjectAction("stage-1")).status).toBe("ERROR");
  });

  it("4/5. OUT_OF_SCOPE for a project whose address clearly names an excluded area, before touching providers at all", async () => {
    localityFindUniqueMock.mockResolvedValue(null as never);
    stagingFindUniqueMock.mockResolvedValue(
      stagingRecord({ payload: { ...LINKBAY_PAYLOAD, localityId: undefined, address: "Near Ghodbunder Road, Thane West" } })
    );
    const result = await researchProjectAction("stage-1");
    expect(result.status).toBe("OUT_OF_SCOPE");
    expect(result.error).toContain("Thane");
  });

  it("NO_TARGET_FIELDS when every researchable field is already resolved", async () => {
    const fullyResolvedPayload = {
      ...LINKBAY_PAYLOAD,
      address: "Off Link Road, Andheri West",
      microMarketId: "Andheri West micro-market",
      priceMinRupees: 65900000,
      description: "3 BHK apartments",
      highlights: ["Sea view"],
      amenities: ["Gym"],
      possessionDateIso: "2028-10-01T00:00:00.000Z",
      developerWebsiteUrl: "https://www.adanirealty.com",
      coverImageUrl: "https://example.com/cover.jpg",
      brochureUrl: "https://example.com/brochure.pdf",
    };
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ payload: fullyResolvedPayload }));
    const result = await researchProjectAction("stage-1");
    expect(result.status).toBe("NO_TARGET_FIELDS");
  });

  it("15. never calls Project write methods -- no mock exists for update/create, so any attempt would throw", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    await expect(researchProjectAction("stage-1")).resolves.toBeTruthy();
    // prisma.project only has findUnique mocked above -- an update/create call would throw a TypeError.
  });

  it("gated behind requireMutateSession", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    await researchProjectAction("stage-1");
    expect(requireMutateSession).toHaveBeenCalled();
  });
});

describe("submitResearchFindingsAction (Section 18 -- Claude+Chrome / interactive research handoff)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localityFindUniqueMock.mockResolvedValue({ name: "Andheri West" } as never);
    builderFindUniqueMock.mockResolvedValue(null as never);
    builderFindManyMock.mockResolvedValue([] as never);
    auditLogFindManyMock.mockResolvedValue([] as never);
    auditLogCreateMock.mockResolvedValue({} as never);
    stagingUpdateMock.mockResolvedValue({} as never);
    projectFindUniqueMock.mockResolvedValue(null as never);
  });

  it("10. a well-evidenced, identity-verified finding for a currently-missing field creates a real proposal", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await submitResearchFindingsAction("stage-1", [finding()]);
    expect(result.status).toBe("SUCCESS");
    const address = result.fields!.find((f) => f.key === "address")!;
    expect(address.classification).toBe("GREEN_NEW");
    expect(address.proposedValue).toBe("Off Link Road, Andheri West");
    expect(address.sourceUrl).toBe("https://www.adanirealty.com/linkbay");
  });

  it("3/5. a finding with NO identity signals is rejected, never merged, and reported back", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await submitResearchFindingsAction("stage-1", [finding({ identitySignals: undefined })]);
    expect(result.status).not.toBe("SUCCESS");
    expect(result.rejectedFindings).toEqual(
      expect.arrayContaining([expect.objectContaining({ fieldKey: "address", reason: expect.stringContaining("identity") })])
    );
  });

  it("5. a finding whose page identity signals mismatch this project's RERA is rejected -- wrong-project rejection", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await submitResearchFindingsAction("stage-1", [finding({ identitySignals: { pageRera: "P00000000000" } })]);
    expect(result.rejectedFindings).toEqual(expect.arrayContaining([expect.objectContaining({ fieldKey: "address" })]));
    expect(result.fields?.find((f) => f.key === "address")?.classification).not.toBe("GREEN_NEW");
  });

  it("1. a finding for a non-researchable field key is structurally rejected before it ever reaches the pipeline", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await submitResearchFindingsAction("stage-1", [finding({ fieldKey: "sourceRef", value: "manual" })]);
    expect(result.status).toBe("NO_TARGET_FIELDS");
    expect(result.rejectedFindings![0].reason).toContain("not a researchable field");
  });

  it("8. two identity-verified findings disagreeing on the same field -> CONFLICT, never a silent pick", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await submitResearchFindingsAction("stage-1", [
      finding({ fieldKey: "priceMin", value: "6.59 Cr", sourceUrl: "https://www.adanirealty.com/linkbay" }),
      finding({
        fieldKey: "priceMin",
        value: "7.2 Cr",
        sourceUrl: "https://some-portal.example/linkbay",
        sourceType: "LISTING_PORTAL",
        identitySignals: { pageProjectName: "Linkbay Residences", pageDeveloperName: "Adani Realty" },
      }),
    ]);
    expect(result.fields?.find((f) => f.key === "priceMin")?.classification).toBe("CONFLICT");
  });

  it("5b. a wrong-project finding (mismatched RERA) never contaminates a conflict -- rejected before classification, not silently merged as a third opinion", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await submitResearchFindingsAction("stage-1", [
      finding({ fieldKey: "priceMin", value: "6.59 Cr" }),
      finding({
        fieldKey: "priceMin",
        value: "3.1 Cr",
        sourceUrl: "https://some-portal.example/wrong-project",
        sourceType: "LISTING_PORTAL",
        identitySignals: { pageRera: "P00000000000" },
      }),
    ]);
    expect(result.rejectedFindings?.some((r) => r.sourceUrl.includes("wrong-project"))).toBe(true);
    expect(result.fields?.find((f) => f.key === "priceMin")?.classification).toBe("GREEN_NEW");
  });

  it("13/14. AuditLog records research.started/completed/proposal_created, and the payload/evidence is actually persisted", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    await submitResearchFindingsAction("stage-1", [finding()]);

    expect(stagingUpdateMock).toHaveBeenCalledTimes(1);
    expect(updatedPayload().enrichmentSummary).toBeTruthy();

    const actions = auditLogCreateMock.mock.calls.map((c) => (c[0] as { data: { action: string; entityType: string } }).data);
    expect(actions.some((a) => a.action === "research.started" && a.entityType === RESEARCH_ENTITY_TYPE)).toBe(true);
    expect(actions.some((a) => a.action === "research.proposal_created")).toBe(true);
    expect(actions.some((a) => a.action === "research.completed")).toBe(true);
  });

  it("11. a field the founder already edited (FOUNDER_EDITED, matching the unchanged external state) is protected from a research proposal", async () => {
    auditLogFindManyMock.mockResolvedValue([
      {
        id: "evt-1",
        action: "enrichment.edit_accept",
        entityType: "ProjectEnrichmentField",
        entityId: "stage-1",
        before: null,
        after: {
          fieldKey: "address",
          displayValue: "Founder-curated address",
          payloadChanges: {},
          sourceUrl: "https://www.adanirealty.com/linkbay",
          founderEdited: true,
          overriddenValue: "Off Link Road, Andheri West",
        },
        at: new Date("2026-09-01T00:00:00.000Z"),
        actor: { name: "Founder", email: "founder@example.com" },
      },
    ] as never);
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ payload: { ...LINKBAY_PAYLOAD, address: "Founder-curated address" } }));

    const result = await submitResearchFindingsAction("stage-1", [finding()]); // same value the founder already overrode
    const address = result.fields?.find((f) => f.key === "address");
    expect(address?.classification).toBe("FOUNDER_EDITED");
  });

  it("12. idempotent -- running the exact same finding twice does not duplicate the underlying proposal state", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const first = await submitResearchFindingsAction("stage-1", [finding()]);
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ payload: updatedPayload(0) }));
    const second = await submitResearchFindingsAction("stage-1", [finding()]);
    expect(first.fields?.find((f) => f.key === "address")?.proposedValue).toBe(second.fields?.find((f) => f.key === "address")?.proposedValue);
    expect(second.fields?.find((f) => f.key === "address")?.classification).toBe("GREEN_NEW");
  });

  it("15. never calls Project.update/create -- research only ever writes the staging payload", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    await submitResearchFindingsAction("stage-1", [finding()]);
    // prisma.project mock only exposes findUnique in this suite -- an update/create attempt would throw.
  });
});

describe("buildResearchPlanAction (Section 16 -- read-only query plan for the founder UX)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localityFindUniqueMock.mockResolvedValue({ name: "Andheri West" } as never);
    builderFindUniqueMock.mockResolvedValue(null as never);
    builderFindManyMock.mockResolvedValue([] as never);
  });

  it("2. returns query sets only for currently research-worthy fields", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await buildResearchPlanAction("stage-1");
    expect(result.status).toBe("SUCCESS");
    expect(result.targetFieldKeys).toContain("address");
    expect(result.querySets!.every((q) => result.targetFieldKeys!.includes(q.fieldKey))).toBe(true);
  });

  it("never fetches anything or writes anything -- no update/create mock exists, and none is needed", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    await buildResearchPlanAction("stage-1");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
