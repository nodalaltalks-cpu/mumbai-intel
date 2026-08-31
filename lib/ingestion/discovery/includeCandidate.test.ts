import { describe, expect, it } from "vitest";
import {
  existingDiscoveryCandidatesAsExistingCandidates,
  mapDiscoveryCandidateToProjectPayload,
  pendingProjectStagingAsExistingCandidates,
} from "./includeCandidate";
import type { ProjectDiscoveryCandidatePayload } from "./types";

const CANDIDATE: ProjectDiscoveryCandidatePayload = {
  projectName: "Gurukrupa Ekam",
  developerName: "Gurukrupa Realcon",
  areaName: "Andheri West",
  batchLabel: "Andheri West — Batch 001",
  sourceUrl: "internal:ingest-staging-record:cmtfnfc2x000304k0yy573lnj",
  sourceType: "LISTING_PORTAL",
  discoverySource: "Existing Mumbai Intel staged Project record",
  officialDeveloperUrl: "https://gurukruparealcon.com",
  officialSourceStatus: "IDENTIFIED",
  confidence: "Low",
  duplicateStatus: "NO_MATCH",
  duplicateMatch: null,
};

describe("mapDiscoveryCandidateToProjectPayload (Phase 40 Part D)", () => {
  it("1. maps name/locality/sourceRef correctly and never fabricates price/RERA/possession/address/coordinates", () => {
    const payload = mapDiscoveryCandidateToProjectPayload(CANDIDATE, "loc-andheri-west", null, "cand-1");
    expect(payload.name).toBe("Gurukrupa Ekam");
    expect(payload.localityId).toBe("loc-andheri-west");
    expect(payload.sourceRef).toBe("discovery:cand-1");
    expect(payload.dataSource).toBe("EXTERNAL_OPEN_DATA");
    expect(payload.reraNumber).toBeUndefined();
    expect(payload.priceMinRupees).toBeUndefined();
    expect(payload.priceMaxRupees).toBeUndefined();
    expect(payload.possessionDateIso).toBeUndefined();
    expect(payload.address).toBeUndefined();
    expect(payload.latitude).toBeUndefined();
    expect(payload.longitude).toBeUndefined();
  });

  it("2. uses the minimal, literally-true status/category defaults, never a fabricated construction stage", () => {
    const payload = mapDiscoveryCandidateToProjectPayload(CANDIDATE, "loc-andheri-west", null, "cand-1");
    expect(payload.status).toBe("ANNOUNCED");
    expect(payload.category).toBe("RESIDENTIAL");
  });

  it("3. carries developerGroup as free text ONLY when no builder was resolved -- never sets both", () => {
    const withoutBuilder = mapDiscoveryCandidateToProjectPayload(CANDIDATE, "loc-andheri-west", null, "cand-1");
    expect(withoutBuilder.developerGroup).toBe("Gurukrupa Realcon");
    expect(withoutBuilder.builderId).toBeUndefined();

    const withBuilder = mapDiscoveryCandidateToProjectPayload(CANDIDATE, "loc-andheri-west", "builder-123", "cand-1");
    expect(withBuilder.builderId).toBe("builder-123");
    expect(withBuilder.developerGroup).toBeUndefined();
  });
});

describe("pendingProjectStagingAsExistingCandidates (Phase 40 Part E — cross-staging duplicate safety)", () => {
  it("4. reshapes pending Project staging payloads into the existing matcher's own candidate shape", () => {
    const result = pendingProjectStagingAsExistingCandidates([
      { id: "stg-1", payload: { name: "Godrej Skyshore", localityId: "loc-andheri-west", reraNumber: "PM1180002500076" } as never },
    ]);
    expect(result).toEqual([{ id: "stg-1", name: "Godrej Skyshore", localityId: "loc-andheri-west", reraNumber: "PM1180002500076" }]);
  });

  it("5. a payload with no reraNumber reshapes to null, not undefined -- matching ExistingProjectCandidate's own contract", () => {
    const result = pendingProjectStagingAsExistingCandidates([{ id: "stg-2", payload: { name: "X", localityId: "loc-1" } as never }]);
    expect(result[0].reraNumber).toBeNull();
  });
});

describe("existingDiscoveryCandidatesAsExistingCandidates (Phase 41 Part I — a bulk discovery run never re-stages a candidate already in the Discovery Queue)", () => {
  it("6. reshapes an existing ProjectDiscoveryCandidate row into the matcher's own candidate shape, always with a null reraNumber", () => {
    const result = existingDiscoveryCandidatesAsExistingCandidates(
      [{ id: "disc-1", payload: { ...CANDIDATE, projectName: "Godrej Skyshore" } }],
      "loc-andheri-west"
    );
    expect(result).toEqual([{ id: "disc-1", name: "Godrej Skyshore", localityId: "loc-andheri-west", reraNumber: null }]);
  });
});
