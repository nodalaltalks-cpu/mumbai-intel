import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked BEFORE importing the module under test, matching the existing
// transactionFileImportRunner.test.ts / apifyBridge.test.ts convention.
// resolveDeveloperDomain is intentionally left REAL (pure, already covered by
// developerDomainRegistry.test.ts) -- only the network-touching adapter and
// the database/session boundaries are mocked.
vi.mock("@/lib/auth/guard", () => ({
  requireMutateSession: vi.fn().mockResolvedValue({ userId: "user-1", role: "ADMIN" }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ingestStagingRecord: { findUnique: vi.fn() },
    locality: { findUnique: vi.fn() },
    builder: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/enrichment/adapters/godrejPropertiesAdapter", () => ({
  godrejPropertiesAdapter: { tier: "OFFICIAL_DEVELOPER", resolveDomain: vi.fn(), fetchProjectFacts: vi.fn() },
  GODREJ_SKY_SHORE_PROJECT_URL: "https://www.godrejproperties.com/mumbai/residential/godrej-skyshore",
}));

import { prisma } from "@/lib/prisma";
import { requireMutateSession } from "@/lib/auth/guard";
import { godrejPropertiesAdapter } from "@/lib/enrichment/adapters/godrejPropertiesAdapter";
import { enrichProjectAction } from "./enrichment";

const stagingFindUniqueMock = vi.mocked(prisma.ingestStagingRecord.findUnique);
const localityFindUniqueMock = vi.mocked(prisma.locality.findUnique);
const builderFindUniqueMock = vi.mocked(prisma.builder.findUnique);
const fetchProjectFactsMock = vi.mocked(godrejPropertiesAdapter.fetchProjectFacts);

const GODREJ_PAYLOAD = {
  name: "Godrej Sky Shore",
  status: "UNDER_CONSTRUCTION",
  category: "RESIDENTIAL",
  sourceRef: "PM1180002500076",
  dataSource: "EXTERNAL_OPEN_DATA",
  localityId: "loc-andheri",
  reraNumber: "PM1180002500076",
  description: "3 BHK, Multistorey Apartment is available for Sale in Andheri West, Mumbai for 8.4 Crore(s)",
  developerGroup: "Godrej Properties Ltd.",
  priceMaxRupees: 84000000,
  priceMinRupees: 84000000,
  possessionDateIso: "2031-12-01T00:00:00.000Z",
};

function stagingRecord(overrides: Partial<{ entityType: string; payload: unknown }> = {}) {
  return {
    id: "stage-1",
    batchId: "batch-1",
    entityType: "Project",
    targetId: null,
    payload: GODREJ_PAYLOAD,
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

describe("enrichProjectAction (Phase 29 Part J/K — no writes, no approval, project-only)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localityFindUniqueMock.mockResolvedValue({ name: "Andheri West" } as never);
    builderFindUniqueMock.mockResolvedValue(null as never);
  });

  it("1. is gated behind requireMutateSession (the same auth bar as every other mutate action)", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    fetchProjectFactsMock.mockResolvedValue({});
    await enrichProjectAction("stage-1");
    expect(requireMutateSession).toHaveBeenCalledTimes(1);
  });

  it("2. record not found -> ERROR, no fields fabricated", async () => {
    stagingFindUniqueMock.mockResolvedValue(null);
    const result = await enrichProjectAction("missing-id");
    expect(result.status).toBe("ERROR");
    expect(result.fields).toBeUndefined();
  });

  it("3. rejects a non-Project staging record (Builder/Locality/Transaction/InfraAsset) -> ERROR", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ entityType: "Transaction" }));
    const result = await enrichProjectAction("stage-1");
    expect(result.status).toBe("ERROR");
    expect(fetchProjectFactsMock).not.toHaveBeenCalled();
  });

  it("4. developer with no curated official source -> NO_SOURCE, no fetch attempted", async () => {
    stagingFindUniqueMock.mockResolvedValue(
      stagingRecord({ payload: { ...GODREJ_PAYLOAD, developerGroup: "Some Random Builder Nobody Verified" } })
    );
    const result = await enrichProjectAction("stage-1");
    expect(result.status).toBe("NO_SOURCE");
    expect(fetchProjectFactsMock).not.toHaveBeenCalled();
  });

  it("5. known developer (Godrej) + adapter finds real differences -> SUCCESS with classified fields, each carrying the source URL", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    fetchProjectFactsMock.mockResolvedValue({
      name: { value: "Godrej Skyshore", confidence: "High" },
      priceMax: { value: "₹11.89 Cr", confidence: "High" },
    });

    const result = await enrichProjectAction("stage-1");
    expect(result.status).toBe("SUCCESS");
    expect(result.fields).toBeTruthy();
    const nameField = result.fields!.find((f) => f.key === "name")!;
    expect(nameField.classification).toBe("CONFLICT");
    expect(nameField.sourceUrl).toBe("https://www.godrejproperties.com/mumbai/residential/godrej-skyshore");
    const priceMaxField = result.fields!.find((f) => f.key === "priceMax")!;
    expect(priceMaxField.classification).toBe("GREEN_NEW");
  });

  it("6. adapter throws (network failure / non-OK status) -> SOURCE_UNAVAILABLE, distinct from NO_SOURCE/NO_NEW_INFO", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    fetchProjectFactsMock.mockRejectedValue(new Error("fetch failed"));
    const result = await enrichProjectAction("stage-1");
    expect(result.status).toBe("SOURCE_UNAVAILABLE");
  });

  it("7. source found but every field is already CONFIRMED/MISSING (no GREEN_NEW/YELLOW/CONFLICT) -> NO_NEW_INFO", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    fetchProjectFactsMock.mockResolvedValue({
      developerGroup: { value: "Godrej Properties Ltd.", confidence: "High" },
    });
    const result = await enrichProjectAction("stage-1");
    expect(result.status).toBe("NO_NEW_INFO");
  });

  it("8. never calls any database write method -- the mocked prisma client exposes only read methods, so a write attempt would throw", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    fetchProjectFactsMock.mockResolvedValue({ name: { value: "Godrej Skyshore", confidence: "High" } });
    await expect(enrichProjectAction("stage-1")).resolves.toBeTruthy();
    // No .update/.create mock exists on any mocked model above -- if the action
    // ever attempted one, prisma.<model>.update would be `undefined` and calling
    // it would throw a TypeError, which the test would surface as a failure.
  });

  it("9. never touches the staging record's own status (no approve/reject call) -- action reads it read-only via findUnique only", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    fetchProjectFactsMock.mockResolvedValue({});
    await enrichProjectAction("stage-1");
    expect(stagingFindUniqueMock).toHaveBeenCalledTimes(1);
    expect(stagingFindUniqueMock).toHaveBeenCalledWith({ where: { id: "stage-1" } });
  });
});
