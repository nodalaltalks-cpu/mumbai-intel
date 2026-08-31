import { describe, expect, it } from "vitest";
import { buildEntityMatchProposal, classifyEntityMatch, resolveBuilderMatch, resolveLocalityMatch } from "./resolveNamedEntity";

describe("resolveBuilderMatch (Phase 33 Part C — never creates, only resolves against existing rows)", () => {
  it("1. exact normalized name match", () => {
    const result = resolveBuilderMatch([{ id: "b-1", name: "Adani Realty", reraNumber: null, legalNames: [] }], "adani realty");
    expect(result).toEqual({ status: "SINGLE_MATCH", candidates: [{ id: "b-1", name: "Adani Realty", confidence: 1 }] });
  });

  it("2. BuilderAlias-equivalent match via Builder.legalNames (this repo's existing subsidiary/SPV alias mechanism)", () => {
    const result = resolveBuilderMatch(
      [{ id: "b-1", name: "Adani Realty", reraNumber: null, legalNames: ["Adani Realty & RC Group"] }],
      "Adani Realty & RC Group"
    );
    expect(result.status).toBe("SINGLE_MATCH");
    expect(result.candidates[0].id).toBe("b-1");
  });

  it("3. no match -> NO_MATCH, never fabricated", () => {
    const result = resolveBuilderMatch([{ id: "b-1", name: "Lodha Group", reraNumber: null, legalNames: [] }], "Totally New Developer XYZ");
    expect(result).toEqual({ status: "NO_MATCH", candidates: [] });
  });

  it("4. multiple plausible fuzzy matches, neither an exact hit -> MULTIPLE_MATCHES, never auto-picks one", () => {
    const result = resolveBuilderMatch(
      [
        { id: "b-1", name: "Adani Realty Mumbai", reraNumber: null, legalNames: [] },
        { id: "b-2", name: "Adani Realty Pune", reraNumber: null, legalNames: [] },
      ],
      "Adani Realty"
    );
    expect(result.status).toBe("MULTIPLE_MATCHES");
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("exact match short-circuits fuzzy ambiguity -- an exact name hit is always authoritative", () => {
    const result = resolveBuilderMatch(
      [
        { id: "b-1", name: "Adani Realty", reraNumber: null, legalNames: [] },
        { id: "b-2", name: "Adani Realty Extra Words Co", reraNumber: null, legalNames: [] },
      ],
      "Adani Realty"
    );
    expect(result).toEqual({ status: "SINGLE_MATCH", candidates: [{ id: "b-1", name: "Adani Realty", confidence: 1 }] });
  });
});

describe("resolveLocalityMatch (Phase 33 Part D)", () => {
  it("5. exact normalized locality name match", () => {
    const result = resolveLocalityMatch([{ id: "l-1", name: "Andheri West", aliases: [] }], "andheri west");
    expect(result).toEqual({ status: "SINGLE_MATCH", candidates: [{ id: "l-1", name: "Andheri West", confidence: 1 }] });
  });

  it("6. LocalityAlias match (the existing alias table, reused verbatim)", () => {
    const result = resolveLocalityMatch([{ id: "l-1", name: "Andheri West", aliases: ["Andheri W."] }], "Andheri W.");
    expect(result.status).toBe("SINGLE_MATCH");
    expect(result.candidates[0].id).toBe("l-1");
  });

  it("7. no match -> NO_MATCH, never fabricated", () => {
    const result = resolveLocalityMatch([{ id: "l-1", name: "Andheri West", aliases: [] }], "Some Unrelated Neighbourhood");
    expect(result).toEqual({ status: "NO_MATCH", candidates: [] });
  });

  it("8. multiple plausible matches, neither an exact hit -> MULTIPLE_MATCHES", () => {
    const result = resolveLocalityMatch(
      [
        { id: "l-1", name: "Andheri Station Road West", aliases: [] },
        { id: "l-2", name: "Andheri Station Road East", aliases: [] },
      ],
      "Andheri Station Road"
    );
    expect(result.status).toBe("MULTIPLE_MATCHES");
  });
});

describe("classifyEntityMatch (Phase 33 Part H — existing-value protection, never a silent overwrite)", () => {
  it("11. an existing accepted ID is protected: SINGLE_MATCH pointing at the SAME id -> CONFIRMED, not re-flagged", () => {
    const match = { status: "SINGLE_MATCH" as const, candidates: [{ id: "b-1", name: "Adani Realty", confidence: 1 }] };
    expect(classifyEntityMatch("b-1", match)).toBe("CONFIRMED");
  });

  it("13. SINGLE_MATCH pointing at a DIFFERENT existing id -> CONFLICT, never silently overwritten", () => {
    const match = { status: "SINGLE_MATCH" as const, candidates: [{ id: "b-2", name: "Adani Realty & RC Group", confidence: 1 }] };
    expect(classifyEntityMatch("b-1", match)).toBe("CONFLICT");
  });

  it("blank current + SINGLE_MATCH -> GREEN_NEW", () => {
    const match = { status: "SINGLE_MATCH" as const, candidates: [{ id: "b-1", name: "Adani Realty", confidence: 1 }] };
    expect(classifyEntityMatch(null, match)).toBe("GREEN_NEW");
  });

  it("MULTIPLE_MATCHES -> YELLOW regardless of current value", () => {
    const match = {
      status: "MULTIPLE_MATCHES" as const,
      candidates: [
        { id: "b-1", name: "Adani Realty", confidence: 0.8 },
        { id: "b-2", name: "Adani Realty & RC Group", confidence: 0.75 },
      ],
    };
    expect(classifyEntityMatch(null, match)).toBe("YELLOW");
    expect(classifyEntityMatch("b-1", match)).toBe("YELLOW");
  });

  it("NO_MATCH -> MISSING regardless of current value", () => {
    const match = { status: "NO_MATCH" as const, candidates: [] };
    expect(classifyEntityMatch(null, match)).toBe("MISSING");
    expect(classifyEntityMatch("b-1", match)).toBe("MISSING");
  });
});

describe("buildEntityMatchProposal", () => {
  it("assembles a full proposal row with the correct classification", () => {
    const proposal = buildEntityMatchProposal("builder", "Builder", "Adani Realty", null, null, {
      status: "SINGLE_MATCH",
      candidates: [{ id: "b-1", name: "Adani Realty", confidence: 1 }],
    });
    expect(proposal).toEqual({
      key: "builder",
      label: "Builder",
      proposedName: "Adani Realty",
      currentId: null,
      currentName: null,
      match: { status: "SINGLE_MATCH", candidates: [{ id: "b-1", name: "Adani Realty", confidence: 1 }] },
      classification: "GREEN_NEW",
    });
  });
});
