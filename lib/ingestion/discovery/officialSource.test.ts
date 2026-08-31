import { describe, expect, it } from "vitest";
import { identifyOfficialSource } from "./officialSource";

describe("identifyOfficialSource (Phase 39 Part G)", () => {
  it("8. IDENTIFIED — a developer already in the curated registry (Godrej, Adani, Kalpataru, Gurukrupa Realcon all proven in Phases 29/31/38/40)", () => {
    expect(identifyOfficialSource("Godrej Properties Ltd.")).toEqual({ status: "IDENTIFIED", officialDeveloperUrl: "https://www.godrejproperties.com" });
    expect(identifyOfficialSource("Kalpataru Limited")).toEqual({ status: "IDENTIFIED", officialDeveloperUrl: "https://www.kalpataru.com" });
    expect(identifyOfficialSource("Gurukrupa Realcon")).toEqual({ status: "IDENTIFIED", officialDeveloperUrl: "https://gurukruparealcon.com" });
  });

  it("9. OFFICIAL_SOURCE_UNKNOWN — a developer not yet curated is never guessed (Labharti Realties, per Phase 38's real research)", () => {
    expect(identifyOfficialSource("Labharti Realties")).toEqual({ status: "OFFICIAL_SOURCE_UNKNOWN", officialDeveloperUrl: null });
    expect(identifyOfficialSource("Some Brand New Developer Pvt Ltd")).toEqual({ status: "OFFICIAL_SOURCE_UNKNOWN", officialDeveloperUrl: null });
  });

  it("never derives a domain from the developer name itself (no name-in-URL guessing)", () => {
    // A name-in-URL guesser would happily invent "https://www.labharti.com" or
    // similar -- confirm this function does no such thing.
    const result = identifyOfficialSource("Labharti Realties");
    expect(result.officialDeveloperUrl).toBeNull();
  });
});
