import { describe, expect, it } from "vitest";
import { verifyProjectAgainstMahaRera } from "./verifyMahaRera";
import type { MahaRERARecord } from "./types";

const RECORD_4TH_AVENUE: MahaRERARecord = {
  reraNumber: "P51800023072",
  registeredProjectName: "SunteckCity 4th Avenue Goregaon",
  promoterName: "Sunteck Realty Limited",
  location: "Goregaon West, Mumbai Suburban",
};

describe("verifyProjectAgainstMahaRera (Phase 52 -- orchestration, UNAVAILABLE is never reinterpreted as NO_MATCH)", () => {
  it("9. MahaRERA unreachable -> UNAVAILABLE, not NO_MATCH", async () => {
    const result = await verifyProjectAgainstMahaRera(
      { officialProjectName: "Sunteck Altavia", officialDeveloperName: "Sunteck Realty", officialLocalityName: "Goregaon West" },
      async () => null
    );
    expect(result.classification).toBe("UNAVAILABLE");
  });

  it("a reachable source with real records still classifies normally through the same matcher", async () => {
    const result = await verifyProjectAgainstMahaRera(
      { officialProjectName: "SunteckCity 4th Avenue Goregaon", officialDeveloperName: "Sunteck Realty", officialLocalityName: "Goregaon West" },
      async () => [RECORD_4TH_AVENUE]
    );
    expect(result.classification).toBe("STRONG_MATCH");
  });

});

