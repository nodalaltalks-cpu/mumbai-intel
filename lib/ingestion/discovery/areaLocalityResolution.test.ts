import { describe, expect, it } from "vitest";
import { resolveAreaToLocality } from "./areaLocalityResolution";

const ANDHERI_WEST = { id: "loc-andheri-west", name: "Andheri West", aliases: [] as string[] };
const CHEMBUR = { id: "loc-chembur", name: "Chembur", aliases: [] as string[] };

describe("resolveAreaToLocality (Phase 43 Part E)", () => {
  it("8. exact locality match -- the plain Locality name resolves at tier EXACT", () => {
    const result = resolveAreaToLocality("Andheri West", [ANDHERI_WEST]);
    expect(result).toEqual({ status: "SINGLE_MATCH", localityId: "loc-andheri-west", localityName: "Andheri West", tier: "EXACT" });
  });

  it("9. LocalityAlias match -- a real existing alias resolves at tier EXACT too", () => {
    const withAlias = { ...ANDHERI_WEST, aliases: ["Andheri (W)"] };
    const result = resolveAreaToLocality("Andheri (W)", [withAlias]);
    expect(result.status).toBe("SINGLE_MATCH");
    expect(result.tier).toBe("EXACT");
    expect(result.localityId).toBe("loc-andheri-west");
  });

  it("13. THE REAL Kalpataru Vian case -- 'Hrushikesh, Lokhandwala, Andheri (W)' resolves via the LocalityAlias 'Andheri (W)' contained in the last comma segment", () => {
    const withAlias = { ...ANDHERI_WEST, aliases: ["Andheri (W)"] };
    const result = resolveAreaToLocality("Hrushikesh, Lokhandwala, Andheri (W)", [withAlias]);
    expect(result).toEqual({ status: "SINGLE_MATCH", localityId: "loc-andheri-west", localityName: "Andheri West", tier: "EXACT" });
  });

  it("segment-exact also resolves plain 'Lokhandwala, Andheri West' and 'Versova, Andheri West' (the real Purva Estrella / Lodha Cullinan / Gurukrupa areaNames) without needing the micro-market registry at all", () => {
    expect(resolveAreaToLocality("Lokhandwala, Andheri West", [ANDHERI_WEST])).toMatchObject({ status: "SINGLE_MATCH", tier: "EXACT" });
    expect(resolveAreaToLocality("Versova, Andheri West", [ANDHERI_WEST])).toMatchObject({ status: "SINGLE_MATCH", tier: "EXACT" });
    expect(resolveAreaToLocality("New Link Road, Andheri West", [ANDHERI_WEST])).toMatchObject({ status: "SINGLE_MATCH", tier: "EXACT" });
    expect(resolveAreaToLocality("Juhu Versova Link Road, Andheri West", [ANDHERI_WEST])).toMatchObject({ status: "SINGLE_MATCH", tier: "EXACT" });
  });

  it("10. micro-market -> locality match -- a bare micro-market name with NO trailing locality segment resolves via the curated registry", () => {
    const result = resolveAreaToLocality("Lokhandwala", [ANDHERI_WEST]);
    expect(result).toEqual({ status: "SINGLE_MATCH", localityId: "loc-andheri-west", localityName: "Andheri West", tier: "MICRO_MARKET" });
  });

  it("10b. micro-market registry also matches a micro-market segment even when combined with an UNRELATED extra descriptor", () => {
    const result = resolveAreaToLocality("Model Town, Lokhandwala Circle Road, Versova", [ANDHERI_WEST]);
    expect(result.status).toBe("SINGLE_MATCH");
    expect(result.tier).toBe("MICRO_MARKET");
    expect(result.localityId).toBe("loc-andheri-west");
  });

  it("11. ambiguous locality -- two Localities fuzzy-matching the full string equally well returns MULTIPLE_MATCHES, never a guess", () => {
    const westAndheriAlt = { id: "loc-west-andheri-alt", name: "West Andheri", aliases: [] as string[] };
    const result = resolveAreaToLocality("Andheri West Complex", [ANDHERI_WEST, westAndheriAlt]);
    expect(result.status).toBe("MULTIPLE_MATCHES");
    expect(result.candidates).toHaveLength(2);
  });

  it("12. no locality match -- a genuinely unrelated area string resolves to nothing, never invented", () => {
    const result = resolveAreaToLocality("Some Totally Unrelated Neighbourhood", [ANDHERI_WEST, CHEMBUR]);
    expect(result).toEqual({ status: "NO_MATCH" });
  });

  it("never creates a Locality -- a curated micro-market whose target Locality doesn't exist yet correctly falls through to NO_MATCH", () => {
    const result = resolveAreaToLocality("Lokhandwala", [CHEMBUR]); // "Andheri West" isn't in the existing list at all
    expect(result.status).toBe("NO_MATCH");
  });

  it("segment matching never fires on a WRONG locality when a genuinely different locality happens to share a word", () => {
    // "Chembur" itself is never accidentally matched by a Lokhandwala/Andheri-scoped area string.
    const result = resolveAreaToLocality("Hrushikesh, Lokhandwala, Andheri (W)", [CHEMBUR]);
    expect(result.status).toBe("NO_MATCH");
  });

  describe("Phase 50 -- new micro-market entries, only usable once their real target Locality exists", () => {
    const BANDRA_EAST = { id: "loc-bandra-east", name: "Bandra East", aliases: [] as string[] };
    const BANDRA_WEST = { id: "loc-bandra-west", name: "Bandra West", aliases: [] as string[] };
    const ANDHERI_EAST = { id: "loc-andheri-east", name: "Andheri East", aliases: [] as string[] };
    const VILE_PARLE_WEST = { id: "loc-vile-parle-west", name: "Vile Parle West", aliases: [] as string[] };
    const POWAI = { id: "loc-powai", name: "Powai", aliases: [] as string[] };
    const MALAD_WEST = { id: "loc-malad-west", name: "Malad West", aliases: [] as string[] };
    const KHAR_WEST = { id: "loc-khar-west", name: "Khar West", aliases: [] as string[] };

    it("BKC and 'BKC Annexe' (the real Rustomjee Prive/Cleon wording) resolve to Bandra East, not Bandra West", () => {
      expect(resolveAreaToLocality("BKC", [BANDRA_EAST, BANDRA_WEST])).toMatchObject({ status: "SINGLE_MATCH", tier: "MICRO_MARKET", localityId: "loc-bandra-east" });
      expect(resolveAreaToLocality("BKC Annexe", [BANDRA_EAST, BANDRA_WEST])).toMatchObject({ status: "SINGLE_MATCH", tier: "MICRO_MARKET", localityId: "loc-bandra-east" });
      expect(resolveAreaToLocality("Bandra Kurla Complex", [BANDRA_EAST, BANDRA_WEST])).toMatchObject({ status: "SINGLE_MATCH", localityId: "loc-bandra-east" });
    });

    it("'Pali Hill' (the real Rustomjee Parishram/Crescent wording) resolves to Bandra West, not Bandra East", () => {
      expect(resolveAreaToLocality("Pali Hill", [BANDRA_EAST, BANDRA_WEST])).toMatchObject({ status: "SINGLE_MATCH", tier: "MICRO_MARKET", localityId: "loc-bandra-west" });
    });

    it("'JVPD' (the real Rustomjee 7/9 JVPD wording) resolves to Vile Parle West", () => {
      expect(resolveAreaToLocality("JVPD", [VILE_PARLE_WEST])).toMatchObject({ status: "SINGLE_MATCH", tier: "MICRO_MARKET", localityId: "loc-vile-parle-west" });
    });

    it("Chakala/Marol/MIDC resolve to Andheri East, not Andheri West", () => {
      expect(resolveAreaToLocality("Chakala", [ANDHERI_EAST])).toMatchObject({ status: "SINGLE_MATCH", localityId: "loc-andheri-east" });
      expect(resolveAreaToLocality("Marol", [ANDHERI_EAST])).toMatchObject({ status: "SINGLE_MATCH", localityId: "loc-andheri-east" });
      expect(resolveAreaToLocality("MIDC", [ANDHERI_EAST])).toMatchObject({ status: "SINGLE_MATCH", localityId: "loc-andheri-east" });
    });

    it("Hiranandani Gardens resolves to Powai; Mindspace resolves to Malad West; Khar Danda resolves to Khar West", () => {
      expect(resolveAreaToLocality("Hiranandani Gardens", [POWAI])).toMatchObject({ status: "SINGLE_MATCH", localityId: "loc-powai" });
      expect(resolveAreaToLocality("Mindspace", [MALAD_WEST])).toMatchObject({ status: "SINGLE_MATCH", localityId: "loc-malad-west" });
      expect(resolveAreaToLocality("Khar Danda", [KHAR_WEST])).toMatchObject({ status: "SINGLE_MATCH", localityId: "loc-khar-west" });
    });

    it("a Phase 50 micro-market entry correctly falls through to NO_MATCH when its target Locality doesn't exist in the given list -- never invents one", () => {
      expect(resolveAreaToLocality("BKC", [CHEMBUR])).toEqual({ status: "NO_MATCH" });
      expect(resolveAreaToLocality("Pali Hill", [CHEMBUR])).toEqual({ status: "NO_MATCH" });
    });
  });
});
