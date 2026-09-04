import { describe, expect, it } from "vitest";
import { deriveAreaSearchStrings, resolveStoredAreaNameToLocality } from "./areaEvidenceSearch";
import type { ExistingLocalityWithAliases } from "../areaLocalityResolution";

const ANDHERI_EAST: ExistingLocalityWithAliases = { id: "loc-andheri-east", name: "Andheri East", aliases: [] };
const MULUND_WEST: ExistingLocalityWithAliases = { id: "loc-mulund-west", name: "Mulund West", aliases: [] };
const localities = [ANDHERI_EAST, MULUND_WEST];

describe("deriveAreaSearchStrings", () => {
  it("returns the full trimmed text plus delimiter-split segments and word windows", () => {
    const result = deriveAreaSearchStrings("Andheri East on Western Express Highway");
    expect(result[0]).toBe("Andheri East on Western Express Highway");
    expect(result).toContain("Andheri East");
  });

  it("returns an empty array for blank text", () => {
    expect(deriveAreaSearchStrings("   ")).toEqual([]);
  });
});

describe("resolveStoredAreaNameToLocality", () => {
  // Phase 63 — the exact real-world case that broke cross-run discovery idempotency:
  // "Lodha Acenza" was originally staged with areaName "Andheri East on Western Express
  // Highway" (resolved via a derived 2-word window at STAGE time), but a second discovery
  // run calling resolveAreaToLocality() directly on that stored string got NO_MATCH,
  // silently dropping it from the duplicate-detection pool and re-staging it as "new".
  it("resolves a stored areaName that only matches via a derived sub-phrase, not as a whole string", () => {
    const match = resolveStoredAreaNameToLocality("Andheri East on Western Express Highway", localities);
    expect(match.status).toBe("SINGLE_MATCH");
    expect(match.localityId).toBe("loc-andheri-east");
  });

  it("still resolves a stored areaName that matches directly as a whole string", () => {
    const match = resolveStoredAreaNameToLocality("Mulund West", localities);
    expect(match.status).toBe("SINGLE_MATCH");
    expect(match.localityId).toBe("loc-mulund-west");
  });

  it("returns NO_MATCH for genuinely unresolvable text, never guessing", () => {
    const match = resolveStoredAreaNameToLocality("Some Totally Unrelated Neighbourhood", localities);
    expect(match.status).toBe("NO_MATCH");
  });

  it("returns NO_MATCH for empty text", () => {
    expect(resolveStoredAreaNameToLocality("", localities).status).toBe("NO_MATCH");
  });
});
