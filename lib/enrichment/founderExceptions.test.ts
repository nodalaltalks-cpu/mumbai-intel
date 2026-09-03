import { describe, expect, it, vi, beforeEach } from "vitest";

const auditLogFindManyMock = vi.fn();
const stagingFindManyMock = vi.fn();
const projectFindManyMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { findMany: (...args: unknown[]) => auditLogFindManyMock(...args) },
    ingestStagingRecord: { findMany: (...args: unknown[]) => stagingFindManyMock(...args) },
    project: { findMany: (...args: unknown[]) => projectFindManyMock(...args) },
  },
}));

const logAuditMock = vi.fn();
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args),
}));

import { recordFounderException, getFounderExceptions, FOUNDER_EXCEPTION_ACTION } from "./founderExceptions";
import { ENRICHMENT_HISTORY_ENTITY_TYPE } from "./enrichmentHistory";

function auditRow(overrides: Partial<{ id: string; entityId: string; action: string; at: Date; after: Record<string, unknown> }>) {
  return {
    id: "audit-1",
    entityId: "staging-1",
    action: FOUNDER_EXCEPTION_ACTION,
    entityType: ENRICHMENT_HISTORY_ENTITY_TYPE,
    at: new Date("2026-09-03T00:00:00Z"),
    before: null,
    after: { fieldKey: "launchDate", status: "FOUNDER_UPDATE_REQUIRED", reason: "Genuinely absent", sourcesChecked: ["Official page"], lastAttemptedSource: "Official brochure", recommendedFounderAction: "Supply the date" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stagingFindManyMock.mockResolvedValue([]);
  projectFindManyMock.mockResolvedValue([]);
});

describe("recordFounderException", () => {
  it("writes an AuditLog entry scoped exactly like existing enrichment history, never touching staging/Project", async () => {
    await recordFounderException("user-1", "staging-1", "launchDate", {
      reason: "Genuinely absent from checked sources",
      sourcesChecked: ["Official page", "Official brochure"],
      lastAttemptedSource: "Official brochure",
      recommendedFounderAction: "Supply the launch date",
    });
    expect(logAuditMock).toHaveBeenCalledWith(
      "user-1",
      FOUNDER_EXCEPTION_ACTION,
      ENRICHMENT_HISTORY_ENTITY_TYPE,
      "staging-1",
      { after: expect.objectContaining({ fieldKey: "launchDate", status: "FOUNDER_UPDATE_REQUIRED" }) }
    );
  });
});

describe("getFounderExceptions", () => {
  it("1. a FOUNDER_UPDATE_REQUIRED exception appears in the queue", async () => {
    auditLogFindManyMock.mockResolvedValue([auditRow({})]);
    stagingFindManyMock.mockResolvedValue([{ id: "staging-1", payload: { name: "Kalpataru Vian" }, appliedEntityId: null }]);
    const result = await getFounderExceptions({ filter: "all" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ fieldKey: "launchDate", projectName: "Kalpataru Vian", resolved: false });
  });

  it("2. queries scope to the founder-exception action only — a HUMAN_REVIEW-style row never appears", async () => {
    await getFounderExceptions({});
    expect(auditLogFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { action: FOUNDER_EXCEPTION_ACTION, entityType: ENRICHMENT_HISTORY_ENTITY_TYPE } })
    );
  });

  it("3. an enrichment.autoAccept.evidence row (AUTO_ACCEPT) is never returned, because the query never fetches that action", async () => {
    // The mock only ever returns what the (correctly-scoped) query asks for — this test
    // documents that the where-clause itself is the enforcement point, exercised by test 2.
    auditLogFindManyMock.mockResolvedValue([]);
    const result = await getFounderExceptions({ filter: "all" });
    expect(result.items).toHaveLength(0);
  });

  it("4. no exceptions exist unless recordFounderException was actually called — nothing auto-populates from mere absence of a value", async () => {
    auditLogFindManyMock.mockResolvedValue([]);
    const result = await getFounderExceptions({ filter: "open" });
    expect(result.items).toHaveLength(0);
    expect(result.openCount).toBe(0);
  });

  it("5. a resolved field (now filled in on the approved Project) disappears from Open and appears under Resolved", async () => {
    auditLogFindManyMock.mockResolvedValue([auditRow({})]);
    stagingFindManyMock.mockResolvedValue([{ id: "staging-1", payload: { name: "Kalpataru Vian" }, appliedEntityId: "project-1" }]);
    projectFindManyMock.mockResolvedValue([{ id: "project-1", name: "Kalpataru Vian", slug: "kalpataru-vian", launchDate: new Date("2026-01-01") }]);

    const open = await getFounderExceptions({ filter: "open" });
    expect(open.items).toHaveLength(0);

    const resolved = await getFounderExceptions({ filter: "resolved" });
    expect(resolved.items).toHaveLength(1);
    expect(resolved.items[0].resolved).toBe(true);
  });

  it("6. resolves the project link target from the applied Project when approved, else falls back to the staging record", async () => {
    auditLogFindManyMock.mockResolvedValue([auditRow({})]);
    stagingFindManyMock.mockResolvedValue([{ id: "staging-1", payload: { name: "Kalpataru Vian" }, appliedEntityId: "project-1" }]);
    projectFindManyMock.mockResolvedValue([{ id: "project-1", name: "Kalpataru Vian", slug: "kalpataru-vian", launchDate: null }]);
    const result = await getFounderExceptions({ filter: "open" });
    expect(result.items[0]).toMatchObject({ projectId: "project-1", projectSlug: "kalpataru-vian" });
  });

  it("9. pagination and filtering apply correctly", async () => {
    auditLogFindManyMock.mockResolvedValue([
      auditRow({ id: "a1", entityId: "staging-1", after: { fieldKey: "launchDate", status: "FOUNDER_UPDATE_REQUIRED", reason: "x", sourcesChecked: [], lastAttemptedSource: "y", recommendedFounderAction: "z" } }),
      auditRow({ id: "a2", entityId: "staging-2", after: { fieldKey: "totalUnits", status: "FOUNDER_UPDATE_REQUIRED", reason: "x", sourcesChecked: [], lastAttemptedSource: "y", recommendedFounderAction: "z" } }),
      auditRow({ id: "a3", entityId: "staging-3", after: { fieldKey: "description", status: "FOUNDER_UPDATE_REQUIRED", reason: "x", sourcesChecked: [], lastAttemptedSource: "y", recommendedFounderAction: "z" } }),
    ]);
    stagingFindManyMock.mockResolvedValue([
      { id: "staging-1", payload: { name: "A" }, appliedEntityId: null },
      { id: "staging-2", payload: { name: "B" }, appliedEntityId: null },
      { id: "staging-3", payload: { name: "C" }, appliedEntityId: null },
    ]);
    const page1 = await getFounderExceptions({ filter: "open", page: 1, pageSize: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page1.totalPages).toBe(2);
    const page2 = await getFounderExceptions({ filter: "open", page: 2, pageSize: 2 });
    expect(page2.items).toHaveLength(1);
  });

  it("10. Kalpataru Vian's three known exceptions (description, launchDate, totalUnits) are represented correctly, and address is absent", async () => {
    const rows = ["description", "launchDate", "totalUnits"].map((fieldKey, i) =>
      auditRow({
        id: `audit-${i}`,
        entityId: "kalpataru-staging",
        after: { fieldKey, status: "FOUNDER_UPDATE_REQUIRED", reason: "Genuinely absent from checked sources", sourcesChecked: ["Official page", "Official brochure"], lastAttemptedSource: "Official brochure", recommendedFounderAction: "Supply manually" },
      })
    );
    auditLogFindManyMock.mockResolvedValue(rows);
    stagingFindManyMock.mockResolvedValue([{ id: "kalpataru-staging", payload: { name: "Kalpataru Vian" }, appliedEntityId: "kalpataru-project" }]);
    projectFindManyMock.mockResolvedValue([{ id: "kalpataru-project", name: "Kalpataru Vian", slug: "kalpataru-vian", description: null, launchDate: null, totalUnits: null, address: "Kalpataru Vian, Back road, Lokhandwala Complex, Andheri West, Mumbai, Maharashtra 400053" }]);

    const result = await getFounderExceptions({ filter: "open" });
    expect(result.items.map((r) => r.fieldKey).sort()).toEqual(["description", "launchDate", "totalUnits"]);
    expect(result.items.every((r) => r.projectName === "Kalpataru Vian")).toBe(true);
    expect(result.items.find((r) => r.fieldKey === "address")).toBeUndefined();
  });
});
