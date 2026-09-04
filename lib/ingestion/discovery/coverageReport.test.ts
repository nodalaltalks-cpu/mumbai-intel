import { describe, expect, it, vi, beforeEach } from "vitest";

const stagingFindManyMock = vi.fn();
const localityFindManyMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ingestStagingRecord: { findMany: (...args: unknown[]) => stagingFindManyMock(...args) },
    locality: { findMany: (...args: unknown[]) => localityFindManyMock(...args) },
  },
}));

import { getDiscoveryCoverageReport } from "./coverageReport";

function candidateRow(overrides: Partial<{ status: string; developerName: string; areaName: string }> = {}) {
  return {
    status: overrides.status ?? "PROJECT_STAGED",
    payload: {
      projectName: "Test Project",
      developerName: overrides.developerName ?? "Kalpataru",
      areaName: overrides.areaName ?? "Andheri West",
    },
  };
}

const MUMBAI_LOCALITIES = [
  { id: "loc-andheri-west", name: "Andheri West", aliases: [] },
  { id: "loc-chembur", name: "Chembur", aliases: [] },
  { id: "loc-worli", name: "Worli", aliases: [] },
];

beforeEach(() => {
  vi.clearAllMocks();
  localityFindManyMock.mockResolvedValue(MUMBAI_LOCALITIES);
});

describe("getDiscoveryCoverageReport", () => {
  it("attributes a candidate to its curated developer and resolved locality", async () => {
    stagingFindManyMock.mockResolvedValue([candidateRow({ developerName: "Kalpataru", areaName: "Andheri West" })]);
    const report = await getDiscoveryCoverageReport();
    const kalpataru = report.developers.find((d) => d.domain === "https://www.kalpataru.com");
    expect(kalpataru?.totalCandidates).toBe(1);
    expect(kalpataru?.staged).toBe(1);
    const andheri = report.localities.find((l) => l.localityName === "Andheri West");
    expect(andheri?.candidateCount).toBe(1);
  });

  it("counts every curated developer even with zero candidates, and flags them as low coverage", async () => {
    stagingFindManyMock.mockResolvedValue([]);
    const report = await getDiscoveryCoverageReport();
    expect(report.developers.length).toBe(report.totalCuratedDevelopers);
    expect(report.lowCoverageDevelopers.length).toBe(report.totalCuratedDevelopers);
  });

  it("flags a Mumbai locality with zero candidates as low coverage", async () => {
    stagingFindManyMock.mockResolvedValue([candidateRow({ areaName: "Andheri West" })]);
    const report = await getDiscoveryCoverageReport();
    expect(report.lowCoverageLocalities).toContain("Chembur");
    expect(report.lowCoverageLocalities).toContain("Worli");
    expect(report.lowCoverageLocalities).not.toContain("Andheri West");
  });

  it("counts a non-curated developer's candidate without dropping it, and reports it as unresolved-developer", async () => {
    stagingFindManyMock.mockResolvedValue([candidateRow({ developerName: "Some Unknown Builder" })]);
    const report = await getDiscoveryCoverageReport();
    expect(report.unresolvedDeveloperCandidates).toBe(1);
    expect(report.totalCandidates).toBe(1);
    const unknown = report.developers.find((d) => d.developerName === "Some Unknown Builder");
    expect(unknown?.isCurated).toBe(false);
    expect(unknown?.totalCandidates).toBe(1);
  });

  it("counts a candidate whose area text doesn't resolve to any locality without dropping it, as unresolved-locality", async () => {
    stagingFindManyMock.mockResolvedValue([candidateRow({ areaName: "Nowhere In Particular" })]);
    const report = await getDiscoveryCoverageReport();
    expect(report.unresolvedLocalityCandidates).toBe(1);
    expect(report.totalCandidates).toBe(1);
  });

  it("tallies status buckets correctly across a mix of statuses for the same developer", async () => {
    stagingFindManyMock.mockResolvedValue([
      candidateRow({ status: "PROJECT_STAGED" }),
      candidateRow({ status: "NEEDS_REVIEW" }),
      candidateRow({ status: "EXCLUDED" }),
      candidateRow({ status: "REJECTED_DUPLICATE" }),
      candidateRow({ status: "DISCOVERED" }),
    ]);
    const report = await getDiscoveryCoverageReport();
    const kalpataru = report.developers.find((d) => d.domain === "https://www.kalpataru.com")!;
    expect(kalpataru.totalCandidates).toBe(5);
    expect(kalpataru.staged).toBe(1);
    expect(kalpataru.needsReview).toBe(1);
    expect(kalpataru.excluded).toBe(1);
    expect(kalpataru.rejectedDuplicate).toBe(1);
    expect(kalpataru.inProgress).toBe(1);
  });

  it("never double-counts a developer with multiple curated alias keys under the same domain (e.g. 'Kalpataru' vs 'Kalpataru Limited')", async () => {
    stagingFindManyMock.mockResolvedValue([candidateRow({ developerName: "Kalpataru" }), candidateRow({ developerName: "Kalpataru Limited" })]);
    const report = await getDiscoveryCoverageReport();
    const kalpataruRows = report.developers.filter((d) => d.domain === "https://www.kalpataru.com");
    expect(kalpataruRows).toHaveLength(1);
    expect(kalpataruRows[0].totalCandidates).toBe(2);
  });
});
