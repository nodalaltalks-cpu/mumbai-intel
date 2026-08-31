import { describe, expect, it } from "vitest";
import { buildDiscoveryCandidate, computeInitialDiscoveryStatus } from "./buildCandidate";
import type { ExistingProjectCandidate } from "../duplicateMatch";

const ANDHERI_WEST = "loc-andheri-west";
const EXISTING: ExistingProjectCandidate[] = [{ id: "proj-godrej", name: "Godrej Sky Shore", localityId: ANDHERI_WEST, reraNumber: "PM1180002500076" }];

describe("computeInitialDiscoveryStatus (Phase 39 Part H)", () => {
  it("10a. AMBIGUOUS duplicate -> NEEDS_REVIEW regardless of official-source status", () => {
    expect(computeInitialDiscoveryStatus("AMBIGUOUS", "IDENTIFIED")).toBe("NEEDS_REVIEW");
    expect(computeInitialDiscoveryStatus("AMBIGUOUS", "OFFICIAL_SOURCE_UNKNOWN")).toBe("NEEDS_REVIEW");
  });

  it("10b. EXACT/CLEAR_ALIAS duplicate -> REJECTED_DUPLICATE regardless of official-source status", () => {
    expect(computeInitialDiscoveryStatus("EXACT", "IDENTIFIED")).toBe("REJECTED_DUPLICATE");
    expect(computeInitialDiscoveryStatus("CLEAR_ALIAS", "OFFICIAL_SOURCE_UNKNOWN")).toBe("REJECTED_DUPLICATE");
  });

  it("10c. NO_MATCH + IDENTIFIED -> SOURCE_FOUND", () => {
    expect(computeInitialDiscoveryStatus("NO_MATCH", "IDENTIFIED")).toBe("SOURCE_FOUND");
  });

  it("10d. NO_MATCH + OFFICIAL_SOURCE_UNKNOWN -> DISCOVERED", () => {
    expect(computeInitialDiscoveryStatus("NO_MATCH", "OFFICIAL_SOURCE_UNKNOWN")).toBe("DISCOVERED");
  });
});

describe("buildDiscoveryCandidate (Phase 39 — end-to-end pure assembly)", () => {
  it("a genuinely new project with a known developer becomes SOURCE_FOUND, no duplicate match", () => {
    const built = buildDiscoveryCandidate(
      {
        projectName: "Kalpataru Vian",
        developerName: "Kalpataru Limited",
        areaName: "Hrushikesh, Lokhandwala, Andheri (W)",
        localityId: ANDHERI_WEST,
        batchLabel: "Andheri West — Batch 001",
        sourceUrl: "https://www.kalpataru.com/mumbai/kalpataru-vian",
        sourceType: "OFFICIAL_DEVELOPER",
        discoverySource: "kalpataru.com sitemap.xml",
        confidence: "High",
      },
      EXISTING
    );
    expect(built.status).toBe("SOURCE_FOUND");
    expect(built.matchedExistingId).toBeNull();
    expect(built.matchConfidence).toBeNull();
    expect(built.payload.officialDeveloperUrl).toBe("https://www.kalpataru.com");
    expect(built.payload.duplicateStatus).toBe("NO_MATCH");
  });

  it("a spacing-variant of an already-staged project becomes REJECTED_DUPLICATE with the existing match populated", () => {
    const built = buildDiscoveryCandidate(
      {
        projectName: "Godrej Skyshore",
        developerName: "Some Unrelated Reseller",
        areaName: "Andheri West",
        localityId: ANDHERI_WEST,
        batchLabel: "Andheri West — Batch 001",
        sourceUrl: "https://example-portal.test/godrej-skyshore",
        sourceType: "LISTING_PORTAL",
        discoverySource: "existing Project data",
        confidence: "Medium",
      },
      EXISTING
    );
    expect(built.status).toBe("REJECTED_DUPLICATE");
    expect(built.matchedExistingId).toBe("proj-godrej");
    expect(built.matchConfidence).toBe(1);
    expect(built.payload.duplicateStatus).toBe("CLEAR_ALIAS");
  });

  it("a developer not in the curated registry with no duplicate becomes DISCOVERED (not SOURCE_FOUND)", () => {
    const built = buildDiscoveryCandidate(
      {
        projectName: "Gurukrupa Ekam",
        developerName: "Gurukrupa Realcon",
        areaName: "Andheri West",
        localityId: ANDHERI_WEST,
        batchLabel: "Andheri West — Batch 001",
        sourceUrl: "https://example-portal.test/gurukrupa-ekam",
        sourceType: "LISTING_PORTAL",
        discoverySource: "existing Project data",
        confidence: "Low",
      },
      EXISTING
    );
    expect(built.status).toBe("DISCOVERED");
    expect(built.payload.officialSourceStatus).toBe("OFFICIAL_SOURCE_UNKNOWN");
  });
});
