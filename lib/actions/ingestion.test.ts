import { describe, expect, it, vi, beforeEach } from "vitest";

// Mocked BEFORE importing the module under test, matching the existing
// lib/actions/enrichment.test.ts convention. Only the auth/DB/event
// boundaries are mocked -- toProjectSchemaInput/buildProjectData (pure, no
// DB access) and ensureUniqueSlug/slugify (DB access happens through the
// injected `exists` callback, which itself calls the mocked prisma.project)
// run for real.
vi.mock("@/lib/auth/guard", () => ({
  requireMutateSession: vi.fn().mockResolvedValue({ userId: "user-1", role: "ADMIN" }),
  requireAdminSession: vi.fn().mockResolvedValue({ userId: "user-1", role: "ADMIN" }),
  isAdmin: () => true,
}));

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/events", () => ({
  emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ingestStagingRecord: { findUnique: vi.fn(), update: vi.fn() },
    city: { findUnique: vi.fn() },
    project: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { approveStagingRecordAction } from "./ingestion";
import type { ProjectImportPayload } from "@/lib/ingestion/connectors/fileImport/types";

const stagingFindUniqueMock = vi.mocked(prisma.ingestStagingRecord.findUnique);
const stagingUpdateMock = vi.mocked(prisma.ingestStagingRecord.update);
const cityFindUniqueMock = vi.mocked(prisma.city.findUnique);
const projectFindUniqueMock = vi.mocked(prisma.project.findUnique);
const projectCreateMock = vi.mocked(prisma.project.create);

const BASE_PAYLOAD: ProjectImportPayload = {
  name: "Linkbay Residences",
  status: "UNDER_CONSTRUCTION",
  category: "RESIDENTIAL",
  sourceRef: "P51800047539",
  dataSource: "EXTERNAL_OPEN_DATA",
  localityId: "loc-andheri",
};

function stagingRecord(overrides: Partial<{ payload: unknown; targetId: string | null; status: string }> = {}) {
  return {
    id: "stage-1",
    batchId: "batch-1",
    entityType: "Project",
    targetId: null,
    payload: BASE_PAYLOAD,
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

describe("approveStagingRecordAction -- Project slug resolution (targeted fix, Slug editability)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stagingUpdateMock.mockResolvedValue({} as never);
    cityFindUniqueMock.mockResolvedValue({ id: "city-mumbai" } as never);
    projectCreateMock.mockResolvedValue({ id: "new-project-id" } as never);
  });

  it("E. preserves the existing auto-generated-from-name behavior when the founder never edited the slug", async () => {
    stagingFindUniqueMock.mockResolvedValueOnce(stagingRecord());
    projectFindUniqueMock.mockResolvedValue(null); // slug is free; also used as the post-approval snapshot read
    const result = await approveStagingRecordAction("stage-1");
    expect(result.error).toBeUndefined();
    expect(projectCreateMock).toHaveBeenCalledTimes(1);
    expect(projectCreateMock.mock.calls[0][0].data.slug).toBe("linkbay-residences");
  });

  it("E. uses the founder's edited slug override instead of the name-derived default", async () => {
    stagingFindUniqueMock.mockResolvedValueOnce(stagingRecord({ payload: { ...BASE_PAYLOAD, slug: "linkbay-residences-v2" } }));
    projectFindUniqueMock.mockResolvedValue(null);
    await approveStagingRecordAction("stage-1");
    expect(projectCreateMock.mock.calls[0][0].data.slug).toBe("linkbay-residences-v2");
  });

  it("F. slug uniqueness is enforced: a colliding founder-typed slug is safely auto-suffixed, never rejected and never overwriting the other project", async () => {
    stagingFindUniqueMock.mockResolvedValueOnce(stagingRecord({ payload: { ...BASE_PAYLOAD, slug: "linkbay-residences-v2" } }));
    // First candidate ("linkbay-residences-v2") collides with an existing project; the "-2" suffix is free.
    projectFindUniqueMock.mockImplementation((async ({ where }: { where: { slug?: string; id?: string } }) => {
      if (where.slug === "linkbay-residences-v2") return { id: "some-other-project" };
      return null;
    }) as never);
    const result = await approveStagingRecordAction("stage-1");
    expect(result.error).toBeUndefined();
    expect(projectCreateMock.mock.calls[0][0].data.slug).toBe("linkbay-residences-v2-2");
  });

  it("F. an untouched/absent slug still goes through the same collision-retry loop", async () => {
    stagingFindUniqueMock.mockResolvedValueOnce(stagingRecord());
    projectFindUniqueMock.mockImplementation((async ({ where }: { where: { slug?: string; id?: string } }) => {
      if (where.slug === "linkbay-residences") return { id: "some-other-project" };
      return null;
    }) as never);
    await approveStagingRecordAction("stage-1");
    expect(projectCreateMock.mock.calls[0][0].data.slug).toBe("linkbay-residences-2");
  });

  it("a whitespace-only slug never reaches this path in practice -- applyAcceptedField/validateProposedEdit already reject an override that normalizes to empty before it's ever staged; documents ensureUniqueSlug's own fallback ('item') as defense-in-depth if one somehow did", async () => {
    stagingFindUniqueMock.mockResolvedValueOnce(stagingRecord({ payload: { ...BASE_PAYLOAD, slug: "   " } }));
    projectFindUniqueMock.mockResolvedValue(null);
    await approveStagingRecordAction("stage-1");
    expect(projectCreateMock.mock.calls[0][0].data.slug).toBe("item");
  });

  it("does not touch slug at all for a merge into an EXISTING matched project (targetId set)", async () => {
    stagingFindUniqueMock.mockResolvedValueOnce(stagingRecord({ targetId: "existing-project-id", payload: { ...BASE_PAYLOAD, slug: "ignored" } }));
    const projectUpdateMock = vi.fn().mockResolvedValue({});
    (prisma.project as unknown as { update: typeof projectUpdateMock }).update = projectUpdateMock;
    projectFindUniqueMock.mockResolvedValue({ id: "existing-project-id" } as never);
    const result = await approveStagingRecordAction("stage-1");
    expect(result.error).toBeUndefined();
    expect(projectCreateMock).not.toHaveBeenCalled();
    expect(projectUpdateMock).toHaveBeenCalledWith({ where: { id: "existing-project-id" }, data: expect.not.objectContaining({ slug: expect.anything() }) });
  });
});
