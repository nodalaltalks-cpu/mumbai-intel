import { describe, expect, it } from "vitest";
import { decideCandidateFate } from "./decideCandidateFate";
import type { CandidatePageResult } from "./discoverDeveloperProjects";
import type { AreaEvidenceItem } from "./extractGenericFacts";
import type { ExistingLocalityWithAliases } from "../areaLocalityResolution";

const ANDHERI_WEST: ExistingLocalityWithAliases = { id: "loc-andheri-west", name: "Andheri West", aliases: [] };
const CHEMBUR: ExistingLocalityWithAliases = { id: "loc-chembur", name: "Chembur", aliases: [] };
const MULUND_WEST: ExistingLocalityWithAliases = { id: "loc-mulund-west", name: "Mulund West", aliases: [] };
const localities = [ANDHERI_WEST, CHEMBUR, MULUND_WEST];

function evidence(text: string, source: AreaEvidenceItem["source"] = "json_ld_address"): AreaEvidenceItem[] {
  return [{ text, source }];
}

function candidate(overrides: Partial<CandidatePageResult> = {}): CandidatePageResult {
  return {
    url: "https://d.com/residential/tower-a",
    projectNameGuess: "Tower A",
    areaEvidence: evidence("Andheri West"),
    reraNumber: null,
    statusBucket: "CURRENT",
    statusEvidence: "Page's own text: \"under construction\".",
    confidence: "High",
    ...overrides,
  };
}

describe("decideCandidateFate", () => {
  it("stages a candidate with a clean name, CURRENT status, and a single-match Mumbai locality", () => {
    const fate = decideCandidateFate("Test Developer", "https://d.com", candidate(), localities);
    expect(fate.decision).toBe("STAGE");
    if (fate.decision === "STAGE") {
      expect(fate.localityId).toBe("loc-andheri-west");
      expect(fate.input.projectName).toBe("Tower A");
      expect(fate.input.sourceType).toBe("OFFICIAL_DEVELOPER");
    }
  });

  it("excludes a candidate with no extractable project name", () => {
    const fate = decideCandidateFate("Test Developer", "https://d.com", candidate({ projectNameGuess: null }), localities);
    expect(fate.decision).toBe("EXCLUDED_NO_NAME");
  });

  it("excludes a candidate whose extracted name is just the developer's own name (real Adani Realty residual case from the Phase 56 rerun)", () => {
    const fate = decideCandidateFate("Adani Realty", "https://d.com", candidate({ projectNameGuess: "Adani Realty" }), localities);
    expect(fate.decision).toBe("EXCLUDED_NO_NAME");
  });

  it("excludes a candidate whose extracted name is the developer's SHORT-form brand name (real MICL Group -> bare 'MICL' residual case)", () => {
    const fate = decideCandidateFate("MICL Group", "https://d.com", candidate({ projectNameGuess: "MICL" }), localities);
    expect(fate.decision).toBe("EXCLUDED_NO_NAME");
  });

  it("still stages a real project name that merely starts with the developer's name", () => {
    const fate = decideCandidateFate("Kalpataru", "https://d.com", candidate({ projectNameGuess: "Kalpataru Radiance" }), localities);
    expect(fate.decision).toBe("STAGE");
  });

  it("excludes a candidate whose status evidence says EXCLUDE (e.g. sold out)", () => {
    const fate = decideCandidateFate("Test Developer", "https://d.com", candidate({ statusBucket: "EXCLUDE", statusEvidence: "sold out" }), localities);
    expect(fate.decision).toBe("EXCLUDED_STATUS");
  });

  it("excludes a candidate with no location text at all rather than guessing", () => {
    const fate = decideCandidateFate("Test Developer", "https://d.com", candidate({ areaEvidence: [] }), localities);
    expect(fate.decision).toBe("EXCLUDED_NO_LOCATION_TEXT");
  });

  it("excludes a candidate whose area text resolves to no existing Mumbai locality (outside city / unparseable) — never creates one", () => {
    const fate = decideCandidateFate("Test Developer", "https://d.com", candidate({ areaEvidence: evidence("Some Totally Unrelated Neighbourhood") }), localities);
    expect(fate.decision).toBe("EXCLUDED_LOCATION_UNRESOLVED");
  });

  it("flags an ambiguous area match for review rather than guessing a locality", () => {
    const westAndheriAlt: ExistingLocalityWithAliases = { id: "loc-west-andheri-alt", name: "West Andheri", aliases: [] };
    const fate = decideCandidateFate(
      "Test Developer",
      "https://d.com",
      candidate({ areaEvidence: evidence("Andheri West Complex") }),
      [ANDHERI_WEST, westAndheriAlt]
    );
    expect(fate.decision).toBe("AMBIGUOUS_LOCATION");
  });

  it("still stages a REVIEW-status (pre-launch) candidate, annotated for founder verification, rather than dropping it silently", () => {
    const fate = decideCandidateFate("Test Developer", "https://d.com", candidate({ statusBucket: "REVIEW", statusEvidence: "pre-launch" }), localities);
    expect(fate.decision).toBe("STAGE");
    if (fate.decision === "STAGE") {
      expect(fate.input.discoverySource).toMatch(/status needs founder verification/i);
    }
  });

  it("carries a RERA number through into the stageable input when present", () => {
    const fate = decideCandidateFate("Test Developer", "https://d.com", candidate({ reraNumber: "P51800012345" }), localities);
    expect(fate.decision).toBe("STAGE");
    if (fate.decision === "STAGE") expect(fate.input.reraNumber).toBe("P51800012345");
  });

  // --- Phase 56 Part A: ranked locality-evidence fallback ---

  it("falls back to title-derived locality evidence when there is no JSON-LD address", () => {
    const fate = decideCandidateFate(
      "Test Developer",
      "https://d.com",
      candidate({ areaEvidence: evidence("Tower A — 3 BHK Homes in Mulund West | Test Developer", "title_tag") }),
      localities
    );
    expect(fate.decision).toBe("STAGE");
    if (fate.decision === "STAGE") expect(fate.localityId).toBe("loc-mulund-west");
  });

  it("falls back to OG:title-derived locality evidence when there is no JSON-LD address or title match", () => {
    const fate = decideCandidateFate(
      "Test Developer",
      "https://d.com",
      candidate({ areaEvidence: evidence("Homes for sale, Chembur, Mumbai", "og_title") }),
      localities
    );
    expect(fate.decision).toBe("STAGE");
    if (fate.decision === "STAGE") expect(fate.localityId).toBe("loc-chembur");
  });

  it("resolves locality evidence embedded in a URL slug", () => {
    const fate = decideCandidateFate(
      "Test Developer",
      "https://d.com",
      candidate({ areaEvidence: evidence("tower a mulund west 2bhk", "url_slug") }),
      localities
    );
    expect(fate.decision).toBe("STAGE");
    if (fate.decision === "STAGE") expect(fate.localityId).toBe("loc-mulund-west");
  });

  it("prefers a higher-priority JSON-LD address over a lower-priority (and different) title guess", () => {
    const fate = decideCandidateFate(
      "Test Developer",
      "https://d.com",
      candidate({
        areaEvidence: [
          { text: "Andheri West", source: "json_ld_address" },
          { text: "Homes in Chembur", source: "title_tag" },
        ],
      }),
      localities
    );
    expect(fate.decision).toBe("STAGE");
    if (fate.decision === "STAGE") expect(fate.localityId).toBe("loc-andheri-west");
  });

  it("does not accept a loose FUZZY match from a weak source (title) as 'sufficiently clear' — excludes rather than guesses", () => {
    // "Andheri" alone fuzzy-overlaps both "Andheri West" and a same-named "Andheri East" is not seeded here,
    // so use a single generic word that would only ever fuzzy-match, never exact/micro-market-match.
    const fate = decideCandidateFate(
      "Test Developer",
      "https://d.com",
      candidate({ areaEvidence: evidence("Best New Homes Near West Mumbai", "title_tag") }),
      localities
    );
    expect(fate.decision).not.toBe("STAGE");
  });
});
