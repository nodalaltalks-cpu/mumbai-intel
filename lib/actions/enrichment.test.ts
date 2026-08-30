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
    ingestStagingRecord: { findUnique: vi.fn(), update: vi.fn() },
    locality: { findUnique: vi.fn() },
    builder: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/enrichment/adapters/godrejPropertiesAdapter", () => ({
  godrejPropertiesAdapter: { tier: "OFFICIAL_DEVELOPER", resolveDomain: vi.fn(), fetchProjectFacts: vi.fn() },
  GODREJ_SKY_SHORE_PROJECT_URL: "https://www.godrejproperties.com/mumbai/residential/godrej-skyshore",
}));

vi.mock("@/lib/enrichment/adapters/adaniRealtyAdapter", () => ({
  adaniRealtyAdapter: { tier: "OFFICIAL_DEVELOPER", resolveDomain: vi.fn(), fetchProjectFacts: vi.fn() },
  ADANI_LINKBAY_RESIDENCES_PROJECT_URL: "https://www.adanirealty.com/residential-projects/mumbai/linkbay-residences",
}));

import { prisma } from "@/lib/prisma";
import { requireMutateSession } from "@/lib/auth/guard";
import { godrejPropertiesAdapter } from "@/lib/enrichment/adapters/godrejPropertiesAdapter";
import { adaniRealtyAdapter } from "@/lib/enrichment/adapters/adaniRealtyAdapter";
import { acceptEnrichmentFieldAction, enrichProjectAction } from "./enrichment";

const stagingFindUniqueMock = vi.mocked(prisma.ingestStagingRecord.findUnique);
const stagingUpdateMock = vi.mocked(prisma.ingestStagingRecord.update);
const localityFindUniqueMock = vi.mocked(prisma.locality.findUnique);
const builderFindUniqueMock = vi.mocked(prisma.builder.findUnique);
const fetchProjectFactsMock = vi.mocked(godrejPropertiesAdapter.fetchProjectFacts);
const adaniFetchProjectFactsMock = vi.mocked(adaniRealtyAdapter.fetchProjectFacts);

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

/** Reads the payload passed to the Nth prisma.ingestStagingRecord.update() call, cast the same way transactionFileImportRunner.test.ts's own mock-call assertions already do. */
function updatedPayload(callIndex = 0): Record<string, unknown> {
  return stagingUpdateMock.mock.calls[callIndex][0].data.payload as Record<string, unknown>;
}

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
    stagingUpdateMock.mockResolvedValue({} as never);
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

  it("10. Phase 31 generalization: a second developer (Adani Realty) routes to its own adapter, not Godrej's", async () => {
    const ADANI_PAYLOAD = { ...GODREJ_PAYLOAD, name: "Adani Linkbay Residences", developerGroup: "Adani Realty & RC Group" };
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ payload: ADANI_PAYLOAD }));
    adaniFetchProjectFactsMock.mockResolvedValue({ reraCertificateUrl: { value: "https://example.com/rera.pdf", confidence: "High" } });

    const result = await enrichProjectAction("stage-1");
    expect(result.status).toBe("SUCCESS");
    expect(adaniFetchProjectFactsMock).toHaveBeenCalledWith("https://www.adanirealty.com/residential-projects/mumbai/linkbay-residences");
    expect(fetchProjectFactsMock).not.toHaveBeenCalled(); // Godrej's adapter must never run for a different developer
    const field = result.fields!.find((f) => f.key === "reraCertificateUrl")!;
    expect(field.sourceUrl).toBe("https://www.adanirealty.com/residential-projects/mumbai/linkbay-residences");
  });

  it("11. Adani adapter failure -> SOURCE_UNAVAILABLE, same contract as Godrej's failure path", async () => {
    stagingFindUniqueMock.mockResolvedValue(
      stagingRecord({ payload: { ...GODREJ_PAYLOAD, developerGroup: "Adani Realty & RC Group" } })
    );
    adaniFetchProjectFactsMock.mockRejectedValue(new Error("fetch failed"));
    const result = await enrichProjectAction("stage-1");
    expect(result.status).toBe("SOURCE_UNAVAILABLE");
  });
});

describe("acceptEnrichmentFieldAction (Phase 32 — persists ONE accepted field into the PENDING staging payload only)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stagingUpdateMock.mockResolvedValue({} as never);
  });

  it("1. accepts one GREEN_NEW field and persists it, preserving every other existing field", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await acceptEnrichmentFieldAction("stage-1", "address", "off, Fun Republic, New Link road, Andheri west");
    expect(result.status).toBe("SUCCESS");
    expect(stagingUpdateMock).toHaveBeenCalledWith({
      where: { id: "stage-1" },
      data: { payload: { ...GODREJ_PAYLOAD, address: "off, Fun Republic, New Link road, Andheri west" } },
    });
  });

  it("2. accepting multiple fields (sequential calls) merges each without clobbering the others", async () => {
    stagingFindUniqueMock.mockResolvedValueOnce(stagingRecord());
    await acceptEnrichmentFieldAction("stage-1", "address", "off, Fun Republic, New Link road, Andheri west");
    const afterFirst = updatedPayload(0);

    stagingFindUniqueMock.mockResolvedValueOnce(stagingRecord({ payload: afterFirst }));
    await acceptEnrichmentFieldAction("stage-1", "coverImage", "https://example.com/cover.webp");
    const afterSecond = updatedPayload(1);

    expect(afterSecond.address).toBe("off, Fun Republic, New Link road, Andheri west");
    expect(afterSecond.coverImageUrl).toBe("https://example.com/cover.webp");
    expect(afterSecond.name).toBe(GODREJ_PAYLOAD.name); // untouched, original import value preserved
  });

  it("3. accepts a YELLOW field (e.g. a real amenities list) the same way as GREEN_NEW", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await acceptEnrichmentFieldAction("stage-1", "amenities", "3 selected", ["Squash Court", "Library", "Gym"]);
    expect(result.status).toBe("SUCCESS");
    expect(updatedPayload().amenities).toEqual(["Squash Court", "Library", "Gym"]);
  });

  it("4. accepts a CONFLICT field's proposed value, overwriting the existing staged value only on explicit acceptance", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await acceptEnrichmentFieldAction("stage-1", "name", "Godrej Skyshore");
    expect(result.status).toBe("SUCCESS");
    expect(updatedPayload().name).toBe("Godrej Skyshore");
  });

  it("6. a field never explicitly accepted is not present in the update call -- only the one accepted key changes", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    await acceptEnrichmentFieldAction("stage-1", "reraStatus", "Registered");
    const payload = updatedPayload();
    expect(payload.reraNumber).toBe(GODREJ_PAYLOAD.reraNumber); // untouched
    expect(payload.priceMinRupees).toBe(GODREJ_PAYLOAD.priceMinRupees); // untouched
  });

  it("7. every other existing imported value is preserved verbatim", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    await acceptEnrichmentFieldAction("stage-1", "tagline", "A shoreline sanctuary");
    const payload = updatedPayload();
    for (const key of Object.keys(GODREJ_PAYLOAD) as (keyof typeof GODREJ_PAYLOAD)[]) {
      expect(payload[key]).toEqual(GODREJ_PAYLOAD[key]);
    }
  });

  it("8. a field with no proposed value is rejected as INVALID_VALUE, never silently stored as 'missing'", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await acceptEnrichmentFieldAction("stage-1", "tagline", "");
    expect(result.status).toBe("INVALID_VALUE");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("9. requires the staging record to be PENDING (rejects a record that no longer exists)", async () => {
    stagingFindUniqueMock.mockResolvedValue(null);
    const result = await acceptEnrichmentFieldAction("missing-id", "name", "Godrej Skyshore");
    expect(result.status).toBe("NOT_FOUND");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("10. rejects an APPROVED staging record -- never re-touches an already-approved record's payload", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ status: "APPROVED" } as never));
    const result = await acceptEnrichmentFieldAction("stage-1", "name", "Godrej Skyshore");
    expect(result.status).toBe("NOT_PENDING");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("11. rejects a REJECTED staging record", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ status: "REJECTED" } as never));
    const result = await acceptEnrichmentFieldAction("stage-1", "name", "Godrej Skyshore");
    expect(result.status).toBe("NOT_PENDING");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("12. is gated behind requireMutateSession -- the same auth bar as enrichProjectAction, not the stricter approve-only gate", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    await acceptEnrichmentFieldAction("stage-1", "name", "Godrej Skyshore");
    expect(requireMutateSession).toHaveBeenCalled();
  });

  it("13. rejects an invalid/unknown field key rather than writing an arbitrary payload key", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await acceptEnrichmentFieldAction("stage-1", "notARealField", "whatever");
    expect(result.status).toBe("INVALID_FIELD");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("13b. rejects a real registry key that isn't safely acceptable (locality is a foreign key)", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await acceptEnrichmentFieldAction("stage-1", "locality", "Andheri West");
    expect(result.status).toBe("INVALID_VALUE");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("14. never calls prisma.project.* -- only the staging record's own payload is ever touched", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    await acceptEnrichmentFieldAction("stage-1", "name", "Godrej Skyshore");
    expect(stagingUpdateMock).toHaveBeenCalledTimes(1);
    // No prisma.project mock exists at all in this test file's mocked client --
    // if the action ever attempted prisma.project.update, it would throw.
  });

  it("15. re-enrichment after acceptance: the classifier naturally reports CONFIRMED against the now-updated payload (no special-case logic needed)", async () => {
    stagingFindUniqueMock.mockResolvedValueOnce(stagingRecord());
    await acceptEnrichmentFieldAction("stage-1", "name", "Godrej Skyshore");
    const afterAccept = updatedPayload(0);

    stagingFindUniqueMock.mockResolvedValueOnce(stagingRecord({ payload: afterAccept }));
    fetchProjectFactsMock.mockResolvedValue({ name: { value: "Godrej Skyshore", confidence: "High" } });
    const enrichResult = await enrichProjectAction("stage-1");
    const nameField = enrichResult.fields!.find((f) => f.key === "name")!;
    expect(nameField.classification).toBe("CONFIRMED"); // was CONFLICT before acceptance; now matches
  });

  it("16/17. accepted values persist and are read back correctly on a fresh lookup (simulated resume-after-refresh)", async () => {
    stagingFindUniqueMock.mockResolvedValueOnce(stagingRecord());
    await acceptEnrichmentFieldAction("stage-1", "address", "off, Fun Republic, New Link road, Andheri west");
    const savedPayload = updatedPayload(0);

    // A fresh read (simulating a page reload / new request) sees the accepted value.
    stagingFindUniqueMock.mockResolvedValueOnce(stagingRecord({ payload: savedPayload }));
    const freshRecord = await prisma.ingestStagingRecord.findUnique({ where: { id: "stage-1" } });
    expect((freshRecord as unknown as { payload: Record<string, unknown> }).payload.address).toBe(
      "off, Fun Republic, New Link road, Andheri west"
    );
  });

  it("18. approveStagingRecordAction/rejectStagingRecordAction are not exported by this module -- the approval workflow lives entirely in a separate, untouched file (lib/actions/ingestion.ts)", async () => {
    const thisModule = await import("./enrichment");
    expect((thisModule as Record<string, unknown>).approveStagingRecordAction).toBeUndefined();
    expect((thisModule as Record<string, unknown>).rejectStagingRecordAction).toBeUndefined();
    expect(typeof thisModule.acceptEnrichmentFieldAction).toBe("function");
  });
});
