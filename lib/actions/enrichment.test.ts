import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    locality: { findUnique: vi.fn(), findMany: vi.fn() },
    builder: { findUnique: vi.fn(), findMany: vi.fn() },
    // Targeted fix (real-time Review Queue sync) -- buildProjectReviewSnapshot
    // looks up the matched-duplicate project (only when matchedExistingId is
    // actually set) to recompute completeness the same way page.tsx does.
    // Every existing fixture below defaults matchedExistingId to null, so
    // this is never actually called by any pre-existing test.
    project: { findUnique: vi.fn() },
    city: { findUnique: vi.fn() },
    auditLog: { findMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/queries", () => ({ PRIMARY_CITY_SLUG: "mumbai" }));

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
import { toStorableChanges } from "@/lib/enrichment/enrichmentHistory";
import {
  acceptEnrichmentFieldAction,
  acceptEntityMatchAction,
  enrichProjectAction,
  getEnrichmentFieldHistoryAction,
  rejectEnrichmentFieldAction,
  rejectEntityMatchAction,
  revertEnrichmentFieldAction,
} from "./enrichment";

const stagingFindUniqueMock = vi.mocked(prisma.ingestStagingRecord.findUnique);
const stagingUpdateMock = vi.mocked(prisma.ingestStagingRecord.update);
const localityFindUniqueMock = vi.mocked(prisma.locality.findUnique);
const localityFindManyMock = vi.mocked(prisma.locality.findMany);
const builderFindUniqueMock = vi.mocked(prisma.builder.findUnique);
const builderFindManyMock = vi.mocked(prisma.builder.findMany);
const projectFindUniqueMock = vi.mocked(prisma.project.findUnique);
const cityFindUniqueMock = vi.mocked(prisma.city.findUnique);
const auditLogFindManyMock = vi.mocked(prisma.auditLog.findMany);
const auditLogCreateMock = vi.mocked(prisma.auditLog.create);
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
    auditLogFindManyMock.mockResolvedValue([] as never);
    auditLogCreateMock.mockResolvedValue({} as never);
    builderFindManyMock.mockResolvedValue([] as never);
    localityFindManyMock.mockResolvedValue([] as never);
    cityFindUniqueMock.mockResolvedValue({ id: "city-mumbai" } as never);
    // Phase 43 -- an uncurated project name falls through to
    // resolveProjectSource's LIVE sitemap-discovery tier; stubbing `fetch`
    // to a clean 404 keeps every test in this file offline/deterministic
    // (never a real network call) while still correctly reaching NO_SOURCE.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "" }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
      tagline: { value: "A shoreline sanctuary", confidence: "High" },
    });

    const result = await enrichProjectAction("stage-1");
    expect(result.status).toBe("SUCCESS");
    expect(result.fields).toBeTruthy();
    const nameField = result.fields!.find((f) => f.key === "name")!;
    expect(nameField.classification).toBe("CONFLICT");
    expect(nameField.sourceUrl).toBe("https://www.godrejproperties.com/mumbai/residential/godrej-skyshore");
    const taglineField = result.fields!.find((f) => f.key === "tagline")!;
    expect(taglineField.classification).toBe("GREEN_NEW");
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

  it("A. targeted fix (repeated rejected conflict) -- a field the founder already rejected, with the source repeating the EXACT SAME value, does not come back as an outstanding conflict on the next Enrich run", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    fetchProjectFactsMock.mockResolvedValue({ name: { value: "A Totally Different Name", confidence: "High" } });
    auditLogFindManyMock.mockResolvedValue([
      {
        id: "evt-1",
        action: "enrichment.reject",
        entityType: "ProjectEnrichmentField",
        entityId: "stage-1",
        before: null,
        after: {
          fieldKey: "name",
          displayValue: "A Totally Different Name",
          payloadChanges: {},
          sourceUrl: "https://www.godrejproperties.com/mumbai/residential/godrej-skyshore",
          reason: "Marketing name, not the RERA-registered name.",
        },
        at: new Date("2026-08-30T10:00:00.000Z"),
        actor: { name: "Founder", email: "founder@example.com" },
      },
    ] as never);

    const result = await enrichProjectAction("stage-1");
    const nameField = result.fields!.find((f) => f.key === "name")!;
    expect(nameField.classification).toBe("CONFIRMED");
    expect(nameField.reason).toContain("already reviewed and declined");
  });

  it("B. targeted fix -- a MATERIALLY CHANGED proposal (different value) for a previously-rejected field DOES come back as an outstanding conflict", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    fetchProjectFactsMock.mockResolvedValue({ name: { value: "Godrej Sky Shore Phase 2", confidence: "High" } });
    auditLogFindManyMock.mockResolvedValue([
      {
        id: "evt-1",
        action: "enrichment.reject",
        entityType: "ProjectEnrichmentField",
        entityId: "stage-1",
        before: null,
        after: {
          fieldKey: "name",
          displayValue: "A Totally Different Name", // the OLD, previously-rejected proposal
          payloadChanges: {},
          sourceUrl: "https://www.godrejproperties.com/mumbai/residential/godrej-skyshore",
        },
        at: new Date("2026-08-30T10:00:00.000Z"),
        actor: { name: "Founder", email: "founder@example.com" },
      },
    ] as never);

    const result = await enrichProjectAction("stage-1");
    const nameField = result.fields!.find((f) => f.key === "name")!;
    expect(nameField.classification).toBe("CONFLICT");
    expect(nameField.proposedValue).toBe("Godrej Sky Shore Phase 2");
  });

  it("8. never calls Project/Builder/Locality write methods (Phase 46: it DOES now write its own compact enrichmentSummary onto the SAME staging record -- see the dedicated enrichmentSummary describe block below)", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    fetchProjectFactsMock.mockResolvedValue({ name: { value: "Godrej Skyshore", confidence: "High" } });
    await expect(enrichProjectAction("stage-1")).resolves.toBeTruthy();
    // No .update/.create mock exists on prisma.project/builder/locality above --
    // if the action ever attempted one, it would throw a TypeError, which the
    // test would surface as a failure.
  });

  it("9. never touches the staging record's own status (no approve/reject call), and the one write it does make (Phase 46's summary) never sets status either", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    fetchProjectFactsMock.mockResolvedValue({});
    await enrichProjectAction("stage-1");
    // Phase 46: one findUnique from the enrichment pass itself, one more from
    // persistEnrichmentSummary re-reading the record before merging its write.
    expect(stagingFindUniqueMock).toHaveBeenCalledTimes(2);
    expect(stagingFindUniqueMock).toHaveBeenCalledWith({ where: { id: "stage-1" } });
    expect(stagingUpdateMock).toHaveBeenCalledTimes(1);
    // The update's `data` object only ever contains `payload` -- never a `status` key.
    expect(Object.keys(stagingUpdateMock.mock.calls[0][0].data)).toEqual(["payload"]);
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
      stagingRecord({ payload: { ...GODREJ_PAYLOAD, name: "Linkbay Residences", developerGroup: "Adani Realty & RC Group" } })
    );
    adaniFetchProjectFactsMock.mockRejectedValue(new Error("fetch failed"));
    const result = await enrichProjectAction("stage-1");
    expect(result.status).toBe("SOURCE_UNAVAILABLE");
  });

  it("12. Phase 43 — one developer, MULTIPLE projects: 'Western Heights' fetches Western Heights' own URL, never Linkbay's", async () => {
    stagingFindUniqueMock.mockResolvedValue(
      stagingRecord({ payload: { ...GODREJ_PAYLOAD, name: "Western Heights", developerGroup: "Adani Realty & RC Group" } })
    );
    adaniFetchProjectFactsMock.mockResolvedValue({});
    const result = await enrichProjectAction("stage-1");
    expect(result.status).not.toBe("NO_SOURCE");
    expect(adaniFetchProjectFactsMock).toHaveBeenCalledWith("https://www.adanirealty.com/residential-projects/mumbai/western-heights");
  });

  it("13. Phase 43 — a project name not curated for this developer and with no discovery sourceRef reports NO_SOURCE, never the wrong project's URL", async () => {
    stagingFindUniqueMock.mockResolvedValue(
      stagingRecord({ payload: { ...GODREJ_PAYLOAD, name: "Some Brand New Adani Project", developerGroup: "Adani Realty & RC Group", sourceRef: "PM1180000000000" } })
    );
    const result = await enrichProjectAction("stage-1");
    expect(result.status).toBe("NO_SOURCE");
    expect(adaniFetchProjectFactsMock).not.toHaveBeenCalled();
  });

  it("14. Phase 43 Part C tier 2 — a project Included straight from discovery resolves via its own already-verified discovery sourceUrl, on the correct domain", async () => {
    stagingFindUniqueMock.mockImplementation((async (args: { where: { id: string } }) => {
      if (args.where.id === "stage-1") {
        return stagingRecord({
          payload: {
            ...GODREJ_PAYLOAD,
            name: "Some Freshly Included Adani Project",
            developerGroup: "Adani Realty & RC Group",
            sourceRef: "discovery:disc-1",
          },
        });
      }
      if (args.where.id === "disc-1") {
        return { payload: { sourceUrl: "https://www.adanirealty.com/residential-projects/mumbai/some-freshly-included-project" } };
      }
      return null;
    }) as never);
    adaniFetchProjectFactsMock.mockResolvedValue({});

    const result = await enrichProjectAction("stage-1");
    expect(result.status).not.toBe("NO_SOURCE");
    expect(adaniFetchProjectFactsMock).toHaveBeenCalledWith("https://www.adanirealty.com/residential-projects/mumbai/some-freshly-included-project");
  });

  it("15. Phase 43 Part D — a discovery sourceUrl on a DIFFERENT domain is never trusted, even if a candidate row exists", async () => {
    stagingFindUniqueMock.mockImplementation((async (args: { where: { id: string } }) => {
      if (args.where.id === "stage-1") {
        return stagingRecord({
          payload: { ...GODREJ_PAYLOAD, name: "Some Brand New Adani Project", developerGroup: "Adani Realty & RC Group", sourceRef: "discovery:disc-1" },
        });
      }
      if (args.where.id === "disc-1") {
        return { payload: { sourceUrl: "https://example-lead-gen-portal.test/some-brand-new-adani-project" } };
      }
      return null;
    }) as never);

    const result = await enrichProjectAction("stage-1");
    expect(result.status).toBe("NO_SOURCE");
    expect(adaniFetchProjectFactsMock).not.toHaveBeenCalled();
  });
});

describe("enrichProjectAction persists a compact enrichmentSummary (Phase 46 Part B/D/L)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localityFindUniqueMock.mockResolvedValue({ name: "Andheri West" } as never);
    builderFindUniqueMock.mockResolvedValue(null as never);
    stagingUpdateMock.mockResolvedValue({} as never);
    auditLogFindManyMock.mockResolvedValue([] as never);
    auditLogCreateMock.mockResolvedValue({} as never);
    builderFindManyMock.mockResolvedValue([] as never);
    localityFindManyMock.mockResolvedValue([] as never);
    cityFindUniqueMock.mockResolvedValue({ id: "city-mumbai" } as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "" }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("2. successful enrichment (SUCCESS) persists status READY with the real outstanding GREEN_NEW/YELLOW/CONFLICT field keys", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    fetchProjectFactsMock.mockResolvedValue({
      name: { value: "Godrej Skyshore", confidence: "High" }, // GREEN_NEW/CONFLICT depending on current value
      tagline: { value: "A shoreline sanctuary", confidence: "High" }, // GREEN_NEW
    });
    await enrichProjectAction("stage-1");
    const summary = updatedPayload(0).enrichmentSummary as { status: string; outstanding: Record<string, string> };
    expect(summary.status).toBe("READY");
    expect(Object.keys(summary.outstanding).length).toBeGreaterThan(0);
  });

  it("3. NO_NEW_INFO persists status NO_NEW_INFO with empty outstanding", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    fetchProjectFactsMock.mockResolvedValue({ developerGroup: { value: "Godrej Properties Ltd.", confidence: "High" } });
    await enrichProjectAction("stage-1");
    const summary = updatedPayload(0).enrichmentSummary as { status: string; outstanding: Record<string, string> };
    expect(summary.status).toBe("NO_NEW_INFO");
    expect(summary.outstanding).toEqual({});
  });

  it("4. SOURCE_UNAVAILABLE persists status SOURCE_UNAVAILABLE, distinct from NO_SOURCE/ERROR", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    fetchProjectFactsMock.mockRejectedValue(new Error("fetch failed"));
    await enrichProjectAction("stage-1");
    const summary = updatedPayload(0).enrichmentSummary as { status: string };
    expect(summary.status).toBe("SOURCE_UNAVAILABLE");
  });

  it("no curated source persists status NO_SOURCE", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ payload: { ...GODREJ_PAYLOAD, developerGroup: "Some Random Builder Nobody Verified" } }));
    await enrichProjectAction("stage-1");
    const summary = updatedPayload(0).enrichmentSummary as { status: string };
    expect(summary.status).toBe("NO_SOURCE");
  });

  it("5. ERROR (record not found) never reaches the summary-persistence step at all -- there's no Project staging record to attach a summary to", async () => {
    stagingFindUniqueMock.mockResolvedValue(null);
    await enrichProjectAction("missing-id");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("6. conflicts present -- a real CONFLICT field is reflected in outstanding with the CONFLICT tag, and the badge derivation would report conflictCount > 0", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    fetchProjectFactsMock.mockResolvedValue({ name: { value: "Some Completely Different Name", confidence: "High" } });
    await enrichProjectAction("stage-1");
    const summary = updatedPayload(0).enrichmentSummary as { outstanding: Record<string, string> };
    expect(summary.outstanding.name).toBe("CONFLICT");
  });

  it("a summary-persistence failure never fails the enrichment result itself (best-effort, mirrors logAudit's own swallow-errors convention)", async () => {
    stagingFindUniqueMock.mockResolvedValueOnce(stagingRecord()).mockRejectedValueOnce(new Error("db hiccup"));
    fetchProjectFactsMock.mockResolvedValue({});
    const result = await enrichProjectAction("stage-1");
    expect(result.status).toBeTruthy(); // still returns a real result despite the second findUnique rejecting
  });

  it("12. never touches completeness/readiness -- the summary write only adds the `enrichmentSummary` key, every existing field stays byte-identical", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    fetchProjectFactsMock.mockResolvedValue({});
    await enrichProjectAction("stage-1");
    const { enrichmentSummary: _omit, ...rest } = updatedPayload(0);
    expect(rest).toEqual(GODREJ_PAYLOAD);
  });
});

describe("enrichProjectAction — Builder/Locality resolution (Phase 33)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localityFindUniqueMock.mockResolvedValue({ name: "Andheri West" } as never);
    builderFindUniqueMock.mockResolvedValue(null as never);
    stagingUpdateMock.mockResolvedValue({} as never);
    auditLogFindManyMock.mockResolvedValue([] as never);
    auditLogCreateMock.mockResolvedValue({} as never);
    cityFindUniqueMock.mockResolvedValue({ id: "city-mumbai" } as never);
  });

  it("1. exact Builder match is attached as a SINGLE_MATCH proposal when developerGroup resolves to exactly one existing Builder", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    builderFindManyMock.mockResolvedValue([{ id: "bldr-1", name: "Godrej Properties", legalNames: [], reraNumber: null }] as never);
    localityFindManyMock.mockResolvedValue([] as never);
    fetchProjectFactsMock.mockResolvedValue({ developerGroup: { value: "Godrej Properties", confidence: "High" } });

    const result = await enrichProjectAction("stage-1");
    expect(result.builderMatch?.match.status).toBe("SINGLE_MATCH");
    expect(result.builderMatch?.match.candidates[0].id).toBe("bldr-1");
    expect(result.builderMatch?.classification).toBe("GREEN_NEW"); // payload.builderId was blank
  });

  it("5. exact Locality match proposal is attached when the source's locality resolves to exactly one existing Locality", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    builderFindManyMock.mockResolvedValue([] as never);
    localityFindManyMock.mockResolvedValue([{ id: "loc-andheri-real", name: "Andheri West", aliases: [] }] as never);
    fetchProjectFactsMock.mockResolvedValue({ locality: { value: "Andheri West", confidence: "High" } });

    const result = await enrichProjectAction("stage-1");
    expect(result.localityMatch?.match.status).toBe("SINGLE_MATCH");
    expect(result.localityMatch?.match.candidates[0].id).toBe("loc-andheri-real");
    // The staged record already has a DIFFERENT localityId ("loc-andheri") -- a real match against a different existing row is a genuine CONFLICT.
    expect(result.localityMatch?.classification).toBe("CONFLICT");
  });

  it("4. multiple plausible Builder matches surface as MULTIPLE_MATCHES, never auto-picked", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    builderFindManyMock.mockResolvedValue([
      { id: "bldr-1", name: "Adani Realty Mumbai", legalNames: [], reraNumber: null },
      { id: "bldr-2", name: "Adani Realty Pune", legalNames: [], reraNumber: null },
    ] as never);
    fetchProjectFactsMock.mockResolvedValue({ developerGroup: { value: "Adani Realty", confidence: "High" } });

    const result = await enrichProjectAction("stage-1");
    expect(result.builderMatch?.match.status).toBe("MULTIPLE_MATCHES");
    expect(result.builderMatch?.classification).toBe("YELLOW");
  });

  it("3. no Builder match at all -> classification MISSING, never fabricated", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    builderFindManyMock.mockResolvedValue([{ id: "bldr-1", name: "Lodha Group", legalNames: [], reraNumber: null }] as never);
    fetchProjectFactsMock.mockResolvedValue({ developerGroup: { value: "Totally Unrelated Developer XYZ", confidence: "High" } });

    const result = await enrichProjectAction("stage-1");
    expect(result.builderMatch?.match.status).toBe("NO_MATCH");
    expect(result.builderMatch?.classification).toBe("MISSING");
  });

  it("11/12. existing accepted Builder/Locality is protected -- a SINGLE_MATCH pointing at the SAME already-set id is CONFIRMED, not re-flagged", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ payload: { ...GODREJ_PAYLOAD, builderId: "bldr-1" } }));
    builderFindManyMock.mockResolvedValue([{ id: "bldr-1", name: "Godrej Properties", legalNames: [], reraNumber: null }] as never);
    builderFindUniqueMock.mockResolvedValue({ name: "Godrej Properties" } as never);
    fetchProjectFactsMock.mockResolvedValue({ developerGroup: { value: "Godrej Properties", confidence: "High" } });

    const result = await enrichProjectAction("stage-1");
    expect(result.builderMatch?.classification).toBe("CONFIRMED");
  });

  it("13. Builder conflict: existing builderId set, real match points elsewhere -> CONFLICT, never silently overwritten", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ payload: { ...GODREJ_PAYLOAD, builderId: "bldr-old" } }));
    builderFindManyMock.mockResolvedValue([{ id: "bldr-new", name: "Adani Realty", legalNames: [], reraNumber: null }] as never);
    builderFindUniqueMock.mockResolvedValue({ name: "Some Other Builder" } as never);
    fetchProjectFactsMock.mockResolvedValue({ developerGroup: { value: "Adani Realty", confidence: "High" } });

    const result = await enrichProjectAction("stage-1");
    expect(result.builderMatch?.classification).toBe("CONFLICT");
    expect(result.builderMatch?.match.candidates[0].id).toBe("bldr-new");
  });

  it("locality queries scope to the primary city (existing convention, same as transactionFileImportRunner.ts)", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    localityFindManyMock.mockResolvedValue([] as never);
    fetchProjectFactsMock.mockResolvedValue({ locality: { value: "Andheri West", confidence: "High" } });

    await enrichProjectAction("stage-1");
    expect(cityFindUniqueMock).toHaveBeenCalledWith({ where: { slug: "mumbai" }, select: { id: true } });
    expect(localityFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cityId: "city-mumbai" } })
    );
  });

  it("no developerGroup/locality fact at all -> no Builder/Locality MATCH PROPOSAL is attached, and no locality DB query happens (targeted fix: Official Developer Website's OWN read-only builder lookup is a separate, always-on resolution and is expected to query Builder regardless of whether this run's source proposed a developerGroup)", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    fetchProjectFactsMock.mockResolvedValue({ metaTitle: { value: "Something", confidence: "High" } });
    builderFindManyMock.mockResolvedValue([] as never);

    const result = await enrichProjectAction("stage-1");
    expect(result.builderMatch).toBeUndefined();
    expect(result.localityMatch).toBeUndefined();
    expect(localityFindManyMock).not.toHaveBeenCalled();
  });
});

describe("acceptEntityMatchAction (Phase 33 Part F/G — persists a founder-selected EXISTING Builder/Locality id, never creates one)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stagingUpdateMock.mockResolvedValue({} as never);
    auditLogFindManyMock.mockResolvedValue([] as never);
    auditLogCreateMock.mockResolvedValue({} as never);
    // Targeted fix (Official Developer Website) -- buildProjectReviewSnapshot's
    // own resolveOfficialDeveloperWebsite call reaches prisma.builder.findMany
    // whenever payload.developerGroup is set (true for every stagingRecord()
    // fixture below) and no builderId-based lookup already found a website.
    // Explicitly mocked here (not relying on a prior describe block's
    // leftover mock state, which vi.clearAllMocks() does NOT reset) so this
    // suite passes in isolation, not just as part of the full file run.
    builderFindManyMock.mockResolvedValue([] as never);
  });

  it("9. accepts a Builder match and persists builderId (not the name) into the payload", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    builderFindUniqueMock.mockResolvedValue({ id: "bldr-1", name: "Adani Realty" } as never);

    const result = await acceptEntityMatchAction("stage-1", "builder", "bldr-1");
    expect(result.status).toBe("SUCCESS");
    expect(stagingUpdateMock).toHaveBeenCalledWith({
      where: { id: "stage-1" },
      data: { payload: { ...GODREJ_PAYLOAD, builderId: "bldr-1" } },
    });
  });

  it("10. accepts a Locality match and persists localityId into the payload", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    localityFindUniqueMock.mockResolvedValue({ id: "loc-real", name: "Andheri West" } as never);

    const result = await acceptEntityMatchAction("stage-1", "locality", "loc-real");
    expect(result.status).toBe("SUCCESS");
    expect(stagingUpdateMock).toHaveBeenCalledWith({
      where: { id: "stage-1" },
      data: { payload: { ...GODREJ_PAYLOAD, localityId: "loc-real" } },
    });
  });

  it("16. only PENDING staging records can be modified -- rejects APPROVED", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ status: "APPROVED" } as never));
    const result = await acceptEntityMatchAction("stage-1", "builder", "bldr-1");
    expect(result.status).toBe("NOT_PENDING");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("16b. only PENDING staging records can be modified -- rejects REJECTED", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ status: "REJECTED" } as never));
    const result = await acceptEntityMatchAction("stage-1", "builder", "bldr-1");
    expect(result.status).toBe("NOT_PENDING");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("17. is gated behind requireMutateSession", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    builderFindUniqueMock.mockResolvedValue({ id: "bldr-1", name: "Adani Realty" } as never);
    await acceptEntityMatchAction("stage-1", "builder", "bldr-1");
    expect(requireMutateSession).toHaveBeenCalled();
  });

  it("18. rejects an invalid/nonexistent Builder id rather than trusting the client", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    builderFindUniqueMock.mockResolvedValue(null as never);
    const result = await acceptEntityMatchAction("stage-1", "builder", "bldr-does-not-exist");
    expect(result.status).toBe("INVALID_ENTITY");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("18b. rejects an invalid/nonexistent Locality id rather than trusting the client", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    localityFindUniqueMock.mockResolvedValue(null as never);
    const result = await acceptEntityMatchAction("stage-1", "locality", "loc-does-not-exist");
    expect(result.status).toBe("INVALID_ENTITY");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("record not found -> NOT_FOUND", async () => {
    stagingFindUniqueMock.mockResolvedValue(null);
    const result = await acceptEntityMatchAction("missing-id", "builder", "bldr-1");
    expect(result.status).toBe("NOT_FOUND");
  });

  it("23. accepted id survives a fresh read (same mechanism as Phase 32's accepted fields)", async () => {
    stagingFindUniqueMock.mockResolvedValueOnce(stagingRecord());
    builderFindUniqueMock.mockResolvedValue({ id: "bldr-1", name: "Adani Realty" } as never);
    await acceptEntityMatchAction("stage-1", "builder", "bldr-1");
    const saved = stagingUpdateMock.mock.calls[0][0].data.payload as Record<string, unknown>;

    stagingFindUniqueMock.mockResolvedValueOnce(stagingRecord({ payload: saved }));
    const fresh = await prisma.ingestStagingRecord.findUnique({ where: { id: "stage-1" } });
    expect((fresh as unknown as { payload: Record<string, unknown> }).payload.builderId).toBe("bldr-1");
  });

  it("14. never calls prisma.project.* -- only the staging record's own payload is ever touched", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    builderFindUniqueMock.mockResolvedValue({ id: "bldr-1", name: "Adani Realty" } as never);
    await acceptEntityMatchAction("stage-1", "builder", "bldr-1");
    expect(stagingUpdateMock).toHaveBeenCalledTimes(1);
    expect(projectFindUniqueMock).not.toHaveBeenCalled(); // no matchedExistingId on this fixture -- never queried
  });

  it("24. targeted fix (real-time Review Queue sync) -- SUCCESS carries a fresh snapshot reflecting the just-linked builder", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    builderFindUniqueMock.mockResolvedValue({ id: "bldr-1", name: "Adani Realty" } as never);
    const result = await acceptEntityMatchAction("stage-1", "builder", "bldr-1");
    expect(result.status).toBe("SUCCESS");
    expect(result.snapshot).toBeDefined();
    expect(result.snapshot!.completeness.totalFields).toBeGreaterThan(0);
  });

  it("25. a FAILED match (invalid builder id) never returns a snapshot", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    builderFindUniqueMock.mockResolvedValue(null as never);
    const result = await acceptEntityMatchAction("stage-1", "builder", "bldr-does-not-exist");
    expect(result.status).toBe("INVALID_ENTITY");
    expect(result.snapshot).toBeUndefined();
  });
});

describe("rejectEntityMatchAction (targeted fix, Reject option consistency -- upgrades the entity-match card's 'Keep Current' into a proper reason-required, history-recorded reject)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stagingUpdateMock.mockResolvedValue({} as never);
    auditLogCreateMock.mockResolvedValue({} as never);
    builderFindManyMock.mockResolvedValue([] as never);
  });

  it("Q/R. requires a non-empty reason -- never persists or logs anything when blank", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await rejectEntityMatchAction("stage-1", "builder", "   ");
    expect(result.status).toBe("INVALID_REASON");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
    expect(auditLogCreateMock).not.toHaveBeenCalled();
  });

  it("records a REJECT event under a synthetic 'builderMatch' field key -- never applies the match, never touches the staging payload", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await rejectEntityMatchAction("stage-1", "builder", "Wrong entity, not the actual developer.", { proposedName: "Adani Realty" });
    expect(result.status).toBe("SUCCESS");
    expect(stagingUpdateMock).not.toHaveBeenCalled(); // "keep current" never writes payload.builderId

    expect(auditLogCreateMock).toHaveBeenCalledTimes(1);
    const call = auditLogCreateMock.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.action).toBe("enrichment.reject");
    expect(call.data.entityType).toBe("ProjectEnrichmentField");
    expect(call.data.entityId).toBe("stage-1");
    const after = call.data.after as Record<string, unknown>;
    expect(after.fieldKey).toBe("builderMatch");
    expect(after.displayValue).toBe("Adani Realty");
    expect(after.reason).toBe("Wrong entity, not the actual developer.");
  });

  it("uses a distinct 'localityMatch' field key for locality, never colliding with the real 'locality' field's own history", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    await rejectEntityMatchAction("stage-1", "locality", "Not the right locality.", { proposedName: "Bandra West" });
    const call = auditLogCreateMock.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((call.data.after as Record<string, unknown>).fieldKey).toBe("localityMatch");
  });

  it("returns a fresh snapshot on SUCCESS, consistent with every other mutation action", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await rejectEntityMatchAction("stage-1", "builder", "reason");
    expect(result.snapshot).toBeDefined();
  });

  it("requires the staging record to exist and be PENDING", async () => {
    stagingFindUniqueMock.mockResolvedValue(null);
    expect((await rejectEntityMatchAction("missing-id", "builder", "reason")).status).toBe("NOT_FOUND");

    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ status: "APPROVED" } as never));
    expect((await rejectEntityMatchAction("stage-1", "builder", "reason")).status).toBe("NOT_PENDING");
  });

  it("is gated behind requireMutateSession", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    await rejectEntityMatchAction("stage-1", "builder", "reason");
    expect(requireMutateSession).toHaveBeenCalled();
  });
});

describe("acceptEnrichmentFieldAction (Phase 32 — persists ONE accepted field into the PENDING staging payload only)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stagingUpdateMock.mockResolvedValue({} as never);
    auditLogFindManyMock.mockResolvedValue([] as never);
    auditLogCreateMock.mockResolvedValue({} as never);
    builderFindManyMock.mockResolvedValue([] as never);
    localityFindManyMock.mockResolvedValue([] as never);
    cityFindUniqueMock.mockResolvedValue({ id: "city-mumbai" } as never);
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

  it("Phase 46 Part I/L 7/8 -- accepting a field removes it from enrichmentSummary.outstanding, leaving sibling fields untouched", async () => {
    stagingFindUniqueMock.mockResolvedValue(
      stagingRecord({
        payload: {
          ...GODREJ_PAYLOAD,
          enrichmentSummary: { status: "READY", lastRunAt: "2026-01-01T00:00:00.000Z", outstanding: { name: "CONFLICT", tagline: "GREEN_NEW" } },
        },
      })
    );
    await acceptEnrichmentFieldAction("stage-1", "name", "Godrej Skyshore");
    const summary = updatedPayload().enrichmentSummary as { outstanding: Record<string, string> };
    expect(summary.outstanding).toEqual({ tagline: "GREEN_NEW" });
  });

  it("Phase 46 Part L 7 -- accepting every outstanding field leaves an empty outstanding map (all proposals accepted)", async () => {
    stagingFindUniqueMock.mockResolvedValueOnce(
      stagingRecord({
        payload: { ...GODREJ_PAYLOAD, enrichmentSummary: { status: "READY", lastRunAt: "2026-01-01T00:00:00.000Z", outstanding: { name: "CONFLICT" } } },
      })
    );
    await acceptEnrichmentFieldAction("stage-1", "name", "Godrej Skyshore");
    const summary = updatedPayload(0).enrichmentSummary as { outstanding: Record<string, string> };
    expect(summary.outstanding).toEqual({});
  });

  it("Phase 46 Part L 8 -- an Edit + Accept (a locally-edited proposedValue) still goes through the same acceptEnrichmentFieldAction path and still touches the summary", async () => {
    stagingFindUniqueMock.mockResolvedValue(
      stagingRecord({
        payload: { ...GODREJ_PAYLOAD, enrichmentSummary: { status: "READY", lastRunAt: "2026-01-01T00:00:00.000Z", outstanding: { name: "CONFLICT" } } },
      })
    );
    // The founder edited the proposed value before accepting -- still just a plain string through the same action.
    const result = await acceptEnrichmentFieldAction("stage-1", "name", "Godrej Skyshore (Founder Edited)");
    expect(result.status).toBe("SUCCESS");
    expect(updatedPayload().name).toBe("Godrej Skyshore (Founder Edited)");
    expect((updatedPayload().enrichmentSummary as { outstanding: Record<string, string> }).outstanding).toEqual({});
  });

  it("Phase 46 Part L 10 -- re-accepting an already-accepted field (no longer in outstanding) is a harmless no-op for the summary", async () => {
    stagingFindUniqueMock.mockResolvedValue(
      stagingRecord({ payload: { ...GODREJ_PAYLOAD, enrichmentSummary: { status: "READY", lastRunAt: "2026-01-01T00:00:00.000Z", outstanding: {} } } })
    );
    const result = await acceptEnrichmentFieldAction("stage-1", "name", "Godrej Skyshore Re-Accepted");
    expect(result.status).toBe("SUCCESS");
    expect((updatedPayload().enrichmentSummary as { outstanding: Record<string, string> }).outstanding).toEqual({});
  });

  it("6. a field never explicitly accepted is not present in the update call -- only the one accepted key changes", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    await acceptEnrichmentFieldAction("stage-1", "googleMapsUrl", "https://maps.app.goo.gl/example");
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

  it("19. targeted fix (real-time Review Queue sync) -- SUCCESS carries a fresh snapshot with the just-accepted field no longer outstanding, computed from the SAME payload just written", async () => {
    stagingFindUniqueMock.mockResolvedValue(
      stagingRecord({
        payload: {
          ...GODREJ_PAYLOAD,
          enrichmentSummary: { status: "READY", lastRunAt: "2026-01-01T00:00:00.000Z", outstanding: { name: "CONFLICT", tagline: "GREEN_NEW" } },
        },
      })
    );
    const result = await acceptEnrichmentFieldAction("stage-1", "name", "Godrej Skyshore");
    expect(result.status).toBe("SUCCESS");
    expect(result.snapshot).toBeDefined();
    // "name" was resolved by this very call -- only "tagline" remains outstanding.
    expect(result.snapshot!.enrichmentBadge.proposedCount).toBe(1);
    expect(result.snapshot!.enrichmentOutstanding).toEqual({ tagline: "GREEN_NEW" });
    // The completeness snapshot is the SAME registry-derived calculation the
    // Review Queue page itself uses -- not a hand-rolled counter.
    const byKey = new Map(result.snapshot!.completeness.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get("name")?.value).toBe("Godrej Skyshore");
  });

  it("20. a FAILED mutation (invalid field) never returns a snapshot -- no data exists to falsely imply the UI should update", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await acceptEnrichmentFieldAction("stage-1", "notARealField", "whatever");
    expect(result.status).toBe("INVALID_FIELD");
    expect(result.snapshot).toBeUndefined();
  });
});

describe("rejectEnrichmentFieldAction (targeted fix, founder-testing round — Accept/Edit/REJECT model, never applies the value)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stagingUpdateMock.mockResolvedValue({} as never);
    auditLogFindManyMock.mockResolvedValue([] as never);
    auditLogCreateMock.mockResolvedValue({} as never);
    // See acceptEntityMatchAction's own beforeEach comment -- buildProjectReviewSnapshot's
    // resolveOfficialDeveloperWebsite reaches this whenever developerGroup is set.
    builderFindManyMock.mockResolvedValue([] as never);
  });

  it("A. requires a non-empty reason -- rejects with INVALID_REASON and never touches the payload or history when blank", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await rejectEnrichmentFieldAction("stage-1", "name", "   ");
    expect(result.status).toBe("INVALID_REASON");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
    expect(auditLogCreateMock).not.toHaveBeenCalled();
  });

  it("B. rejecting a proposed value never applies it -- the staging payload's real field value is untouched", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await rejectEnrichmentFieldAction("stage-1", "name", "Not the developer's real project name", {
      proposedValue: "A Totally Different Name",
    });
    expect(result.status).toBe("SUCCESS");
    expect(updatedPayload().name).toBe(GODREJ_PAYLOAD.name); // unchanged -- never overwritten by the rejected proposal
  });

  it("B2. rejecting removes the field from enrichmentSummary.outstanding, same as Accept -- it no longer counts as needing attention", async () => {
    stagingFindUniqueMock.mockResolvedValue(
      stagingRecord({
        payload: {
          ...GODREJ_PAYLOAD,
          enrichmentSummary: { status: "READY", lastRunAt: "2026-01-01T00:00:00.000Z", outstanding: { name: "CONFLICT", tagline: "GREEN_NEW" } },
        },
      })
    );
    await rejectEnrichmentFieldAction("stage-1", "name", "Confirmed via a phone call with the developer's sales office");
    const summary = updatedPayload().enrichmentSummary as { outstanding: Record<string, string> };
    expect(summary.outstanding).toEqual({ tagline: "GREEN_NEW" });
  });

  it("C. records a REJECT event in the SAME enrichment history AuditLog, carrying the reason and the declined value -- never fabricated, never a silent no-op", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    await rejectEnrichmentFieldAction("stage-1", "name", "Marketing name, not the RERA-registered name", {
      proposedValue: "A Totally Different Name",
      sourceUrl: "https://example.com/project",
      sourceType: "OFFICIAL_DEVELOPER",
      confidence: "High",
    });

    expect(auditLogCreateMock).toHaveBeenCalledTimes(1);
    const call = auditLogCreateMock.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.action).toBe("enrichment.reject");
    expect(call.data.entityType).toBe("ProjectEnrichmentField");
    expect(call.data.entityId).toBe("stage-1");
    expect(call.data.before).toBeNull();
    const after = call.data.after as Record<string, unknown>;
    expect(after.fieldKey).toBe("name");
    expect(after.displayValue).toBe("A Totally Different Name");
    expect(after.reason).toBe("Marketing name, not the RERA-registered name");
    expect(after.sourceUrl).toBe("https://example.com/project");
  });

  it("does not expose sensitive information -- the recorded reason is exactly the founder's own text, nothing appended or templated", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    await rejectEnrichmentFieldAction("stage-1", "name", "  Just not correct  ");
    const call = auditLogCreateMock.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((call.data.after as Record<string, unknown>).reason).toBe("Just not correct");
  });

  it("rejects an invalid/unknown field key", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await rejectEnrichmentFieldAction("stage-1", "notARealField", "some reason");
    expect(result.status).toBe("INVALID_FIELD");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("requires the staging record to exist and be PENDING", async () => {
    stagingFindUniqueMock.mockResolvedValue(null);
    expect((await rejectEnrichmentFieldAction("missing-id", "name", "reason")).status).toBe("NOT_FOUND");

    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ status: "APPROVED" } as never));
    expect((await rejectEnrichmentFieldAction("stage-1", "name", "reason")).status).toBe("NOT_PENDING");
  });

  it("is gated behind requireMutateSession -- the same auth bar as accept/revert", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    await rejectEnrichmentFieldAction("stage-1", "name", "reason");
    expect(requireMutateSession).toHaveBeenCalled();
  });

  it("never calls prisma.project.* -- only the staging record's own payload is ever touched, the live Project stays untouched", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    await rejectEnrichmentFieldAction("stage-1", "name", "reason");
    expect(stagingUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("D. targeted fix (real-time Review Queue sync) -- SUCCESS carries a fresh snapshot with the rejected field no longer outstanding (e.g. '13 proposed / 1 conflict' -> '13 proposed / 0 conflict')", async () => {
    stagingFindUniqueMock.mockResolvedValue(
      stagingRecord({
        payload: {
          ...GODREJ_PAYLOAD,
          enrichmentSummary: { status: "READY", lastRunAt: "2026-01-01T00:00:00.000Z", outstanding: { name: "CONFLICT" } },
        },
      })
    );
    const result = await rejectEnrichmentFieldAction("stage-1", "name", "Marketing name, not the RERA-registered name");
    expect(result.status).toBe("SUCCESS");
    expect(result.snapshot!.enrichmentBadge.proposedCount).toBe(0);
    expect(result.snapshot!.enrichmentBadge.conflictCount).toBe(0);
    expect(result.snapshot!.enrichmentOutstanding).toEqual({});
  });

  it("E. a FAILED rejection (blank reason) never returns a snapshot", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    const result = await rejectEnrichmentFieldAction("stage-1", "name", "   ");
    expect(result.status).toBe("INVALID_REASON");
    expect(result.snapshot).toBeUndefined();
  });
});

describe("Phase 37 — enrichment history (built entirely on the existing AuditLog model, no new table)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stagingUpdateMock.mockResolvedValue({} as never);
    auditLogCreateMock.mockResolvedValue({} as never);
    // See acceptEntityMatchAction's own beforeEach comment -- buildProjectReviewSnapshot's
    // resolveOfficialDeveloperWebsite reaches this whenever developerGroup is set.
    builderFindManyMock.mockResolvedValue([] as never);
  });

  function auditRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "evt-1",
      action: "enrichment.accept",
      entityType: "ProjectEnrichmentField",
      entityId: "stage-1",
      before: null,
      after: { fieldKey: "address", displayValue: "off New Link Rd", payloadChanges: { address: "off New Link Rd" } },
      at: new Date("2026-08-30T10:00:00.000Z"),
      actor: { name: "Founder", email: "founder@example.com" },
      ...overrides,
    } as never;
  }

  it("1. first acceptance (no prior history) records an ACCEPT event", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    auditLogFindManyMock.mockResolvedValue([] as never);

    await acceptEnrichmentFieldAction("stage-1", "tagline", "A shoreline sanctuary", undefined, { currentDisplayValue: null });

    expect(auditLogCreateMock).toHaveBeenCalledTimes(1);
    const call = auditLogCreateMock.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.action).toBe("enrichment.accept");
    expect(call.data.entityType).toBe("ProjectEnrichmentField");
    expect(call.data.entityId).toBe("stage-1");
    expect((call.data.after as Record<string, unknown>).displayValue).toBe("A shoreline sanctuary");
  });

  it("2. a previously-blank field's history records the blank as the 'before' state, not fabricated", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord()); // GODREJ_PAYLOAD has no `address` key at all
    auditLogFindManyMock.mockResolvedValue([] as never);

    await acceptEnrichmentFieldAction("stage-1", "address", "off, Fun Republic, New Link road, Andheri west", undefined, {
      currentDisplayValue: null,
    });

    const call = auditLogCreateMock.mock.calls[0][0] as { data: Record<string, unknown> };
    const before = call.data.before as Record<string, unknown>;
    expect(before.displayValue).toBeNull();
    // The recorded "before" state marks `address` as having been genuinely
    // absent (not a stray real value) -- restoring it must DELETE the key,
    // not merely fail to set it. (See test #14 below for the full Undo path;
    // this test only confirms Accept records the right "before" state.)
    expect(Object.prototype.hasOwnProperty.call(before.payloadChanges, "address")).toBe(true);
    expect((before.payloadChanges as Record<string, unknown>).address).not.toBe("off, Fun Republic, New Link road, Andheri west");
  });

  it("3. a previously non-blank field's history records the real prior value, not null", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord()); // GODREJ_PAYLOAD.name = "Godrej Sky Shore"
    auditLogFindManyMock.mockResolvedValue([] as never);

    await acceptEnrichmentFieldAction("stage-1", "name", "Godrej Skyshore", undefined, { currentDisplayValue: "Godrej Sky Shore" });

    const call = auditLogCreateMock.mock.calls[0][0] as { data: Record<string, unknown> };
    const before = call.data.before as Record<string, unknown>;
    expect(before.displayValue).toBe("Godrej Sky Shore");
    expect((before.payloadChanges as Record<string, unknown>).name).toBe("Godrej Sky Shore");
  });

  it("5. accepting again after a prior ACCEPT (no revert in between) records EDIT_ACCEPT, using the prior event's own 'after' as this event's 'before'", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ payload: { ...GODREJ_PAYLOAD, tagline: "Old tagline" } }));
    auditLogFindManyMock.mockResolvedValue([
      auditRow({
        action: "enrichment.accept",
        after: { fieldKey: "tagline", displayValue: "Old tagline", payloadChanges: { tagline: "Old tagline" } },
      }),
    ] as never);

    await acceptEnrichmentFieldAction("stage-1", "tagline", "Corrected tagline");

    const call = auditLogCreateMock.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.action).toBe("enrichment.edit_accept");
    expect((call.data.before as Record<string, unknown>).displayValue).toBe("Old tagline");
    expect((call.data.after as Record<string, unknown>).displayValue).toBe("Corrected tagline");
  });

  it("9. accepting again after a REVERT records RE_ACCEPT", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ payload: { ...GODREJ_PAYLOAD, tagline: "Old tagline" } }));
    auditLogFindManyMock.mockResolvedValue([
      auditRow({
        action: "enrichment.revert",
        before: { fieldKey: "tagline", displayValue: "Corrected tagline", payloadChanges: { tagline: "Corrected tagline" } },
        after: { fieldKey: "tagline", displayValue: "Old tagline", payloadChanges: { tagline: "Old tagline" } },
      }),
    ] as never);

    await acceptEnrichmentFieldAction("stage-1", "tagline", "Corrected tagline (again)");

    const call = auditLogCreateMock.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.action).toBe("enrichment.re_accept");
  });

  it("16. accept/revert/history-read all require the existing requireMutateSession authorization", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    auditLogFindManyMock.mockResolvedValue([] as never);
    await acceptEnrichmentFieldAction("stage-1", "tagline", "x");
    await revertEnrichmentFieldAction("stage-1", "tagline", "evt-1");
    await getEnrichmentFieldHistoryAction("stage-1", "tagline");
    expect(vi.mocked(requireMutateSession)).toHaveBeenCalledTimes(3);
  });
});

describe("revertEnrichmentFieldAction (Phase 37 — exact restoration, never a blind null)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stagingUpdateMock.mockResolvedValue({} as never);
    auditLogCreateMock.mockResolvedValue({} as never);
    // See acceptEntityMatchAction's own beforeEach comment -- buildProjectReviewSnapshot's
    // resolveOfficialDeveloperWebsite reaches this whenever developerGroup is set.
    builderFindManyMock.mockResolvedValue([] as never);
  });

  function auditRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "evt-1",
      action: "enrichment.accept",
      entityType: "ProjectEnrichmentField",
      entityId: "stage-1",
      before: { fieldKey: "landAreaAcres", displayValue: null, payloadChanges: toStorableChanges([{ key: "landAreaAcres", value: undefined }]) },
      after: { fieldKey: "landAreaAcres", displayValue: "2.5 acres", payloadChanges: { landAreaAcres: 2.5 } },
      at: new Date("2026-08-30T10:00:00.000Z"),
      actor: { name: "Founder", email: "founder@example.com" },
      ...overrides,
    } as never;
  }

  it("6/12. restores an exact numeric value, not a re-parsed string", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ payload: { ...GODREJ_PAYLOAD, landAreaAcres: 2.5 } }));
    auditLogFindManyMock.mockResolvedValue([auditRow()] as never);

    const result = await revertEnrichmentFieldAction("stage-1", "landAreaAcres", "evt-1");
    expect(result.status).toBe("SUCCESS");
    const restored = stagingUpdateMock.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(restored.landAreaAcres).toBeUndefined(); // the field genuinely had no value before this acceptance
  });

  it("Phase 46 Part I/L 9 -- undoing a field removes it from enrichmentSummary.outstanding too, leaving siblings untouched", async () => {
    stagingFindUniqueMock.mockResolvedValue(
      stagingRecord({
        payload: {
          ...GODREJ_PAYLOAD,
          landAreaAcres: 2.5,
          enrichmentSummary: { status: "READY", lastRunAt: "2026-01-01T00:00:00.000Z", outstanding: { landAreaAcres: "GREEN_NEW", tagline: "YELLOW" } },
        },
      })
    );
    auditLogFindManyMock.mockResolvedValue([auditRow()] as never);

    const result = await revertEnrichmentFieldAction("stage-1", "landAreaAcres", "evt-1");
    expect(result.status).toBe("SUCCESS");
    const restored = stagingUpdateMock.mock.calls[0][0].data.payload as Record<string, unknown>;
    const summary = restored.enrichmentSummary as { outstanding: Record<string, string> };
    expect(summary.outstanding).toEqual({ tagline: "YELLOW" });
  });

  it("11. restores an exact array value", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ payload: { ...GODREJ_PAYLOAD, amenities: ["Squash Court", "Gym"] } }));
    auditLogFindManyMock.mockResolvedValue([
      auditRow({
        before: { fieldKey: "amenities", displayValue: null, payloadChanges: toStorableChanges([{ key: "amenities", value: undefined }]) },
        after: { fieldKey: "amenities", displayValue: "2 selected", payloadChanges: { amenities: ["Squash Court", "Gym"] } },
      }),
    ] as never);

    const result = await revertEnrichmentFieldAction("stage-1", "amenities", "evt-1");
    expect(result.status).toBe("SUCCESS");
    const restored = stagingUpdateMock.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(restored.amenities).toBeUndefined();
  });

  it("13. restores an exact enum key (not the display label)", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ payload: { ...GODREJ_PAYLOAD, status: "READY_TO_MOVE" } }));
    auditLogFindManyMock.mockResolvedValue([
      auditRow({
        before: { fieldKey: "status", displayValue: "Under Construction", payloadChanges: { status: "UNDER_CONSTRUCTION" } },
        after: { fieldKey: "status", displayValue: "Ready to Move", payloadChanges: { status: "READY_TO_MOVE" } },
      }),
    ] as never);

    const result = await revertEnrichmentFieldAction("stage-1", "status", "evt-1");
    expect(result.status).toBe("SUCCESS");
    const restored = stagingUpdateMock.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(restored.status).toBe("UNDER_CONSTRUCTION");
  });

  it("14. a field that was originally blank stays blank after undo -- never coerced to null/empty-string as a NEW distinct value", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ payload: { ...GODREJ_PAYLOAD, tagline: "Accepted tagline" } }));
    auditLogFindManyMock.mockResolvedValue([
      auditRow({
        before: { fieldKey: "tagline", displayValue: null, payloadChanges: toStorableChanges([{ key: "tagline", value: undefined }]) },
        after: { fieldKey: "tagline", displayValue: "Accepted tagline", payloadChanges: { tagline: "Accepted tagline" } },
      }),
    ] as never);

    const result = await revertEnrichmentFieldAction("stage-1", "tagline", "evt-1");
    expect(result.status).toBe("SUCCESS");
    const restored = stagingUpdateMock.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(restored, "tagline")).toBe(false);
  });

  it("7. revert itself records a new REVERT history event", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ payload: { ...GODREJ_PAYLOAD, landAreaAcres: 2.5 } }));
    auditLogFindManyMock.mockResolvedValue([auditRow()] as never);

    await revertEnrichmentFieldAction("stage-1", "landAreaAcres", "evt-1");

    expect(auditLogCreateMock).toHaveBeenCalledTimes(1);
    const call = auditLogCreateMock.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.action).toBe("enrichment.revert");
  });

  it("8. revert never updates or deletes the prior history event -- only ever calls auditLog.create, never update/delete", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ payload: { ...GODREJ_PAYLOAD, landAreaAcres: 2.5 } }));
    auditLogFindManyMock.mockResolvedValue([auditRow()] as never);

    await revertEnrichmentFieldAction("stage-1", "landAreaAcres", "evt-1");

    // The mocked prisma.auditLog only exposes findMany/create (see the top-level
    // vi.mock) -- if this action ever attempted .update or .delete, it would
    // throw a TypeError, which would surface as a test failure here.
    expect(auditLogCreateMock).toHaveBeenCalled();
  });

  it("15. a stale historyEventId (the field changed since the founder last looked) is rejected as CONFLICT, never blindly overwritten", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ payload: { ...GODREJ_PAYLOAD, landAreaAcres: 3.1 } }));
    // The MOST RECENT event is now evt-2, not the evt-1 the caller believes is latest.
    auditLogFindManyMock.mockResolvedValue([
      auditRow({ id: "evt-2", at: new Date("2026-08-31T09:00:00.000Z") }),
      auditRow({ id: "evt-1", at: new Date("2026-08-30T10:00:00.000Z") }),
    ] as never);

    const result = await revertEnrichmentFieldAction("stage-1", "landAreaAcres", "evt-1");
    expect(result.status).toBe("CONFLICT");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects undo when there is no history at all for this field", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    auditLogFindManyMock.mockResolvedValue([] as never);
    const result = await revertEnrichmentFieldAction("stage-1", "tagline", "evt-1");
    expect(result.status).toBe("NOTHING_TO_UNDO");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects undo when the most recent event is already a REVERT", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord());
    auditLogFindManyMock.mockResolvedValue([auditRow({ action: "enrichment.revert" })] as never);
    const result = await revertEnrichmentFieldAction("stage-1", "landAreaAcres", "evt-1");
    expect(result.status).toBe("NOTHING_TO_UNDO");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("only PENDING staging records can be reverted", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ status: "APPROVED" } as never));
    const result = await revertEnrichmentFieldAction("stage-1", "landAreaAcres", "evt-1");
    expect(result.status).toBe("NOT_PENDING");
    expect(stagingUpdateMock).not.toHaveBeenCalled();
  });

  it("26. targeted fix (real-time Review Queue sync) -- SUCCESS carries a fresh snapshot computed from the restored payload", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ payload: { ...GODREJ_PAYLOAD, landAreaAcres: 2.5 } }));
    auditLogFindManyMock.mockResolvedValue([auditRow()] as never);
    const result = await revertEnrichmentFieldAction("stage-1", "landAreaAcres", "evt-1");
    expect(result.status).toBe("SUCCESS");
    expect(result.snapshot).toBeDefined();
    const byKey = new Map(result.snapshot!.completeness.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    // auditRow()'s "before" restores landAreaAcres to unset -- the snapshot must reflect that, not the pre-revert value.
    expect(byKey.get("landAreaAcres")?.status).toBe("MISSING");
  });

  it("27. a FAILED revert (stale historyEventId) never returns a snapshot", async () => {
    stagingFindUniqueMock.mockResolvedValue(stagingRecord({ payload: { ...GODREJ_PAYLOAD, landAreaAcres: 3.1 } }));
    auditLogFindManyMock.mockResolvedValue([
      auditRow({ id: "evt-2", at: new Date("2026-08-31T09:00:00.000Z") }),
      auditRow({ id: "evt-1", at: new Date("2026-08-30T10:00:00.000Z") }),
    ] as never);
    const result = await revertEnrichmentFieldAction("stage-1", "landAreaAcres", "evt-1");
    expect(result.status).toBe("CONFLICT");
    expect(result.snapshot).toBeUndefined();
  });
});

describe("getEnrichmentFieldHistoryAction (Phase 37 — read-only, field-filtered)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only events for the requested field, newest first", async () => {
    auditLogFindManyMock.mockResolvedValue([
      {
        id: "evt-2",
        action: "enrichment.accept",
        before: null,
        after: { fieldKey: "tagline", displayValue: "A", payloadChanges: {} },
        at: new Date("2026-08-31T09:00:00.000Z"),
        actor: null,
      },
      {
        id: "evt-1",
        action: "enrichment.accept",
        before: null,
        after: { fieldKey: "landAreaAcres", displayValue: "2.5 acres", payloadChanges: {} },
        at: new Date("2026-08-30T09:00:00.000Z"),
        actor: null,
      },
    ] as never);

    const history = await getEnrichmentFieldHistoryAction("stage-1", "tagline");
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe("evt-2");
  });
});
