import { describe, expect, it, vi, beforeEach } from "vitest";

const getPendingStagingRecordsMock = vi.fn();
vi.mock("@/lib/admin-queries", () => ({
  getPendingStagingRecords: (...args: unknown[]) => getPendingStagingRecordsMock(...args),
}));

const localityFindManyMock = vi.fn();
const builderFindManyMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    locality: { findMany: (...args: unknown[]) => localityFindManyMock(...args) },
    builder: { findMany: (...args: unknown[]) => builderFindManyMock(...args) },
  },
}));

const getResearchActivityForStagingIdsMock = vi.fn();
vi.mock("./researchAttribution", () => ({
  getResearchActivityForStagingIds: (...args: unknown[]) => getResearchActivityForStagingIdsMock(...args),
}));

import { getResearchActivityFeed, humanizeFieldKey } from "./researchActivityFeed";

beforeEach(() => {
  vi.clearAllMocks();
  localityFindManyMock.mockResolvedValue([{ id: "loc-1", name: "Andheri West" }]);
  builderFindManyMock.mockResolvedValue([]);
});

describe("humanizeFieldKey", () => {
  it("splits camelCase and capitalizes the first letter", () => {
    expect(humanizeFieldKey("startingPrice")).toBe("Starting Price");
    expect(humanizeFieldKey("address")).toBe("Address");
  });
});

describe("getResearchActivityFeed", () => {
  it("1. returns nothing when there are no pending Project staging records", async () => {
    getPendingStagingRecordsMock.mockResolvedValue([]);
    const rows = await getResearchActivityFeed();
    expect(rows).toEqual([]);
    expect(getResearchActivityForStagingIdsMock).not.toHaveBeenCalled();
  });

  it("2. skips a Project record with no real research evidence (hasResearch: false)", async () => {
    getPendingStagingRecordsMock.mockResolvedValue([
      { id: "s1", entityType: "Project", payload: { name: "Linkbay Residences", localityId: "loc-1" } },
    ]);
    getResearchActivityForStagingIdsMock.mockResolvedValue(new Map([["s1", { hasResearch: false, fields: [] }]]));
    const rows = await getResearchActivityFeed();
    expect(rows).toEqual([]);
  });

  it("3. flattens one project's research fields into individual rows with project/developer/locality/RERA context", async () => {
    getPendingStagingRecordsMock.mockResolvedValue([
      { id: "s1", entityType: "Project", payload: { name: "Linkbay Residences", localityId: "loc-1", developerGroup: "Rustomjee", reraNumber: "P51800047539" } },
    ]);
    getResearchActivityForStagingIdsMock.mockResolvedValue(
      new Map([
        [
          "s1",
          {
            hasResearch: true,
            providerLabel: "Claude + Chrome",
            fields: [
              { fieldKey: "address", proposedValue: "S.V. Road, Andheri West", status: "ACCEPTED", sourceUrl: "https://x.com", proposedAt: "2026-09-07T00:00:00.000Z", decidedAt: "2026-09-07T00:05:00.000Z" },
            ],
          },
        ],
      ])
    );
    const rows = await getResearchActivityFeed();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      projectName: "Linkbay Residences",
      developerName: "Rustomjee",
      localityName: "Andheri West",
      reraNumber: "P51800047539",
      fieldKey: "address",
      status: "ACCEPTED",
      providerLabel: "Claude + Chrome",
    });
  });

  it("4. ignores non-Project staging records entirely", async () => {
    getPendingStagingRecordsMock.mockResolvedValue([{ id: "t1", entityType: "Transaction", payload: {} }]);
    const rows = await getResearchActivityFeed();
    expect(rows).toEqual([]);
    expect(getResearchActivityForStagingIdsMock).not.toHaveBeenCalled();
  });

  it("5. newest proposedAt sorts first", async () => {
    getPendingStagingRecordsMock.mockResolvedValue([
      { id: "s1", entityType: "Project", payload: { name: "A", localityId: "loc-1" } },
      { id: "s2", entityType: "Project", payload: { name: "B", localityId: "loc-1" } },
    ]);
    getResearchActivityForStagingIdsMock.mockResolvedValue(
      new Map([
        ["s1", { hasResearch: true, providerLabel: "Research Agent", fields: [{ fieldKey: "a", proposedValue: "x", status: "PENDING", sourceUrl: null, proposedAt: "2026-09-01T00:00:00.000Z", decidedAt: null }] }],
        ["s2", { hasResearch: true, providerLabel: "Research Agent", fields: [{ fieldKey: "b", proposedValue: "y", status: "PENDING", sourceUrl: null, proposedAt: "2026-09-05T00:00:00.000Z", decidedAt: null }] }],
      ])
    );
    const rows = await getResearchActivityFeed();
    expect(rows.map((r) => r.projectName)).toEqual(["B", "A"]);
  });
});
