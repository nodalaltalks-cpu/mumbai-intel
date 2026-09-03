import { describe, expect, it } from "vitest";
import { decideFieldAutomation } from "./autoDecideFieldAutomation";
import { classifyProjectEnrichment } from "./classifyEnrichment";
import type { ProjectImportPayload } from "../ingestion/connectors/fileImport/types";
import type { SourceFactsMap, SourceMeta } from "./types";
import type { ExistingLocalityWithAliases } from "../ingestion/discovery/areaLocalityResolution";

const OFFICIAL_META: SourceMeta = { url: "https://www.example-developer.com/mumbai/some-project", tier: "OFFICIAL_DEVELOPER" };

const BASE_PAYLOAD: ProjectImportPayload = {
  name: "Kalpataru Vian",
  status: "PRE_LAUNCH",
  category: "RESIDENTIAL",
  sourceRef: "discovery:x",
  dataSource: "EXTERNAL_OPEN_DATA",
  localityId: "loc-andheri-west",
  developerGroup: "Kalpataru Limited",
};

const ANDHERI_WEST: ExistingLocalityWithAliases = { id: "loc-andheri-west", name: "Andheri West", aliases: [] };
const BANDRA_EAST: ExistingLocalityWithAliases = { id: "loc-bandra-east", name: "Bandra East", aliases: [] };
const ALL_LOCALITIES = [ANDHERI_WEST, BANDRA_EAST];

function byKey(payload: ProjectImportPayload, facts: SourceFactsMap, key: string, meta: SourceMeta = OFFICIAL_META) {
  const localityName = payload.localityId === BANDRA_EAST.id ? BANDRA_EAST.name : ANDHERI_WEST.name;
  const fields = classifyProjectEnrichment(payload, { localityName }, facts, meta);
  const field = fields.find((f) => f.key === key);
  if (!field) throw new Error(`field "${key}" not found — check the fixture`);
  return field;
}

describe("decideFieldAutomation — Section 17's baseline scenarios", () => {
  it("1. clean official RERA number (GREEN_NEW, well-formed) -> AUTO_ACCEPT", () => {
    const field = byKey(BASE_PAYLOAD, { reraNumber: { value: "PR1180002600863", confidence: "High" } }, "reraNumber");
    const result = decideFieldAutomation(field);
    expect(result.decision).toBe("AUTO_ACCEPT");
    expect(result.tier).toBe("A");
  });

  it("2. clean official price (GREEN_NEW) -> AUTO_ACCEPT", () => {
    const field = byKey(BASE_PAYLOAD, { priceMin: { value: "₹5.61 Cr", confidence: "High" } }, "priceMin");
    const result = decideFieldAutomation(field);
    expect(result.decision).toBe("AUTO_ACCEPT");
    expect(result.tier).toBe("A");
  });

  it("3. conflicting RERA number -> HUMAN_REVIEW, never AUTO_ACCEPT", () => {
    const payload = { ...BASE_PAYLOAD, reraNumber: "P51800080217" };
    const field = byKey(payload, { reraNumber: { value: "P99999999999", confidence: "High" } }, "reraNumber");
    expect(field.classification).toBe("CONFLICT");
    const result = decideFieldAutomation(field);
    expect(result.decision).toBe("HUMAN_REVIEW");
  });

  it("4. missing field -> MISSING, not an error and never scored down", () => {
    const field = byKey(BASE_PAYLOAD, {}, "reraNumber");
    expect(field.classification).toBe("MISSING");
    const result = decideFieldAutomation(field);
    expect(result.decision).toBe("MISSING");
  });

  it("5. SEO/marketing-paragraph tagline (real Rustomjee Crescent proposal, ambiguous+Medium) -> NOT AUTO_ACCEPT", () => {
    const field = byKey(
      BASE_PAYLOAD,
      {
        tagline: {
          value:
            "Welcome to your private sanctuary spread across 1.2 acres in the heart of Pali Hill. As a one-of-a-kind gated estate in the Bandra-Khar belt, Rustomjee Crescent redefines fine living...",
          confidence: "Medium",
          ambiguous: true,
        },
      },
      "tagline"
    );
    expect(field.classification).toBe("YELLOW");
    const result = decideFieldAutomation(field);
    expect(result.decision).toBe("HUMAN_REVIEW");
    expect(result.decision).not.toBe("AUTO_ACCEPT");
  });

  it("6. a would-be-safe Tier A value from an untrusted/unknown source tier -> HUMAN_REVIEW", () => {
    const field = byKey(BASE_PAYLOAD, { reraNumber: { value: "PR1180002600863", confidence: "High" } }, "reraNumber", {
      url: "https://some-random-listing-portal.example.com/x",
      tier: "LISTING_PORTAL",
    });
    const result = decideFieldAutomation(field);
    expect(result.decision).toBe("HUMAN_REVIEW");
  });

  it("7. a Tier A field with a structurally-invalid value -> HUMAN_REVIEW, not AUTO_ACCEPT (reuses applyAcceptedField's own parser)", () => {
    const field = byKey(BASE_PAYLOAD, { priceMin: { value: "call for price", confidence: "High" } }, "priceMin");
    const result = decideFieldAutomation(field);
    expect(result.decision).toBe("HUMAN_REVIEW");
  });

  it("8. an unrecognized RERA status value -> HUMAN_REVIEW even though the field is Tier A and GREEN_NEW", () => {
    const field = byKey(BASE_PAYLOAD, { reraStatus: { value: "Pending Verification By Committee", confidence: "High" } }, "reraStatus");
    const result = decideFieldAutomation(field);
    expect(result.decision).toBe("HUMAN_REVIEW");
    expect(result.tag).toBe("UNRECOGNIZED_VALUE_FORMAT");
  });

  it("9. a recognized RERA status value -> AUTO_ACCEPT", () => {
    const field = byKey(BASE_PAYLOAD, { reraStatus: { value: "Registered", confidence: "High" } }, "reraStatus");
    expect(decideFieldAutomation(field).decision).toBe("AUTO_ACCEPT");
  });
});

describe("decideFieldAutomation — Tier B/C v1 policy (always HUMAN_REVIEW even on GREEN_NEW)", () => {
  it("10. Tier B field (address), GREEN_NEW, trusted source -> still HUMAN_REVIEW in v1", () => {
    const field = byKey(BASE_PAYLOAD, { address: { value: "Plot 12, Lokhandwala Complex, Andheri West", confidence: "High" } }, "address");
    expect(field.classification).toBe("GREEN_NEW");
    expect(decideFieldAutomation(field).decision).toBe("HUMAN_REVIEW");
  });

  it("11. Tier C field (highlights), GREEN_NEW, trusted source -> still HUMAN_REVIEW in v1", () => {
    const field = byKey(BASE_PAYLOAD, { highlights: { value: "6 listed", confidence: "High", items: ["Sea view", "Clubhouse"] } }, "highlights");
    expect(field.classification).toBe("GREEN_NEW");
    expect(decideFieldAutomation(field).decision).toBe("HUMAN_REVIEW");
  });
});

describe("decideFieldAutomation — Tier D media gate", () => {
  it("12. a project-specific, correctly-typed image URL -> AUTO_ACCEPT", () => {
    const field = byKey(BASE_PAYLOAD, { coverImage: { value: "https://cdn.example-developer.com/kalpataru-vian/hero.jpg", confidence: "High" } }, "coverImage");
    expect(decideFieldAutomation(field).decision).toBe("AUTO_ACCEPT");
  });

  it("13. an obviously generic/sitewide asset -> HUMAN_REVIEW, tagged GENERIC_MEDIA", () => {
    const field = byKey(BASE_PAYLOAD, { coverImage: { value: "https://cdn.example-developer.com/assets/logo.jpg", confidence: "High" } }, "coverImage");
    const result = decideFieldAutomation(field);
    expect(result.decision).toBe("HUMAN_REVIEW");
    expect(result.tag).toBe("GENERIC_MEDIA");
  });

  it("14. wrong asset type for the field (a webpage URL proposed as a brochure) -> HUMAN_REVIEW", () => {
    const field = byKey(BASE_PAYLOAD, { brochure: { value: "https://www.example-developer.com/kalpataru-vian", confidence: "High" } }, "brochure");
    expect(decideFieldAutomation(field).decision).toBe("HUMAN_REVIEW");
  });
});

describe("decideFieldAutomation — Section 15 reference cases (real Phase 58/59 examples)", () => {
  it("Case 1: Kalpataru Vian locality — 'Andheri West' vs 'Hrushikesh, Lokhandwala, Andheri (W)' -> HUMAN_REVIEW, tagged NORMALIZED_MATCH, never overwritten", () => {
    const field = byKey(BASE_PAYLOAD, { locality: { value: "Hrushikesh, Lokhandwala, Andheri (W)", confidence: "High" } }, "locality");
    expect(field.classification).toBe("CONFLICT");
    const result = decideFieldAutomation(field, { currentLocalityId: "loc-andheri-west", localities: ALL_LOCALITIES });
    expect(result.decision).toBe("HUMAN_REVIEW");
    expect(result.tag).toBe("NORMALIZED_MATCH");
  });

  it("Case 2: Rustomjee Seasons locality — 'Bandra East' vs 'BKC Annexe' -> HUMAN_REVIEW, tagged NORMALIZED_MATCH", () => {
    const payload = { ...BASE_PAYLOAD, localityId: BANDRA_EAST.id };
    const field = byKey(payload, { locality: { value: "BKC Annexe", confidence: "High" } }, "locality");
    expect(field.classification).toBe("CONFLICT");
    const result = decideFieldAutomation(field, { currentLocalityId: BANDRA_EAST.id, localities: ALL_LOCALITIES });
    expect(result.decision).toBe("HUMAN_REVIEW");
    expect(result.tag).toBe("NORMALIZED_MATCH");
  });

  it("Case 3: Gurukrupa Dhyanam locality — 'Andheri West' vs 'Versova' -> HUMAN_REVIEW, tagged NORMALIZED_MATCH", () => {
    const field = byKey(BASE_PAYLOAD, { locality: { value: "Versova", confidence: "High" } }, "locality");
    expect(field.classification).toBe("CONFLICT");
    const result = decideFieldAutomation(field, { currentLocalityId: "loc-andheri-west", localities: ALL_LOCALITIES });
    expect(result.decision).toBe("HUMAN_REVIEW");
    expect(result.tag).toBe("NORMALIZED_MATCH");
  });

  it("Case 3b: a GENUINE locality disagreement (not in the curated map) -> HUMAN_REVIEW, NO NORMALIZED_MATCH tag", () => {
    const field = byKey(BASE_PAYLOAD, { locality: { value: "Powai", confidence: "High" } }, "locality");
    expect(field.classification).toBe("CONFLICT");
    const result = decideFieldAutomation(field, { currentLocalityId: "loc-andheri-west", localities: ALL_LOCALITIES });
    expect(result.decision).toBe("HUMAN_REVIEW");
    expect(result.tag).toBeUndefined();
  });

  it("Case 4: Gurukrupa Alaknanda status conflict — 'Announced' vs 'Under Construction' -> HUMAN_REVIEW", () => {
    const payload = { ...BASE_PAYLOAD, status: "ANNOUNCED" as const };
    const field = byKey(payload, { status: { value: "Under Construction", confidence: "High" } }, "status");
    expect(field.classification).toBe("CONFLICT");
    expect(decideFieldAutomation(field).decision).toBe("HUMAN_REVIEW");
  });

  it("Case 5: Adani Western Heights name conflict — 'Adani Western Heights' vs 'Western Heights' -> HUMAN_REVIEW (real name, not garbage — REJECT would be wrong here)", () => {
    const field = byKey(BASE_PAYLOAD, { name: { value: "Western Heights", confidence: "High" } }, "name");
    expect(field.classification).toBe("CONFLICT");
    const result = decideFieldAutomation(field);
    expect(result.decision).toBe("HUMAN_REVIEW");
    expect(result.tier).toBe("PROTECTED");
  });

  it("Case 6/7: Rustomjee Panorama / Rustomjee Prive-style name conflicts -> HUMAN_REVIEW, identity never silently changed", () => {
    const field = byKey(BASE_PAYLOAD, { name: { value: "Panorama by Rustomjee", confidence: "High" } }, "name");
    expect(field.classification).toBe("CONFLICT");
    expect(decideFieldAutomation(field).decision).toBe("HUMAN_REVIEW");
  });

  it("Case 8: a Shapoorji-Pallonji-style name conflict where the PROPOSED value is itself a subpage title -> REJECT, not silent HUMAN_REVIEW", () => {
    const field = byKey(BASE_PAYLOAD, { name: { value: "Nine Arcs Location & Address", confidence: "High" } }, "name");
    expect(field.classification).toBe("CONFLICT");
    const result = decideFieldAutomation(field);
    expect(result.decision).toBe("REJECT");
    expect(result.tag).toBe("SUBPAGE_OR_MARKETING_TITLE");
  });

  it("Case 9: marketing-paragraph tagline proposals are never AUTO_ACCEPT (see also scenario 5 above)", () => {
    const field = byKey(
      BASE_PAYLOAD,
      { tagline: { value: "Discover a life of unparalleled luxury at this iconic address in the heart of the city...", confidence: "Medium", ambiguous: true } },
      "tagline"
    );
    expect(decideFieldAutomation(field).decision).toBe("HUMAN_REVIEW");
  });

  // Case 10 (exact source URL duplicates) is a candidate/project-level check, not a
  // per-field EnrichmentField decision — covered end-to-end in sourceUrlDuplicate.test.ts
  // using the real Kalpataru Vian duplicate-sourceUrl case from Phase 58.
});

describe("decideFieldAutomation — protected identity fields never auto-apply even when GREEN_NEW", () => {
  it("developerGroup filling a blank -> HUMAN_REVIEW, never AUTO_ACCEPT (identity-critical per Section 6)", () => {
    const payload = { ...BASE_PAYLOAD, developerGroup: undefined };
    const field = byKey(payload, { developerGroup: { value: "Kalpataru Limited", confidence: "High" } }, "developerGroup");
    expect(field.classification).toBe("GREEN_NEW");
    const result = decideFieldAutomation(field);
    expect(result.decision).toBe("HUMAN_REVIEW");
    expect(result.tier).toBe("PROTECTED");
  });

  it("name/locality/developerGroup CONFIRMED (source agrees) -> AUTO_ACCEPT as a no-op, nothing to write", () => {
    const field = byKey(BASE_PAYLOAD, { name: { value: "Kalpataru Vian", confidence: "High" } }, "name");
    expect(field.classification).toBe("CONFIRMED");
    expect(decideFieldAutomation(field).decision).toBe("AUTO_ACCEPT");
  });
});

describe("decideFieldAutomation — fields the existing write path can never accept", () => {
  it("builder field GREEN_NEW -> HUMAN_REVIEW, tagged UNSUPPORTED_WRITE_PATH (applyAcceptedField itself refuses this key)", () => {
    const field = byKey(BASE_PAYLOAD, { builder: { value: "Some Builder Co.", confidence: "High" } }, "builder");
    const result = decideFieldAutomation(field);
    expect(result.decision).toBe("HUMAN_REVIEW");
    expect(result.tag).toBe("UNSUPPORTED_WRITE_PATH");
  });

  it("possessionMonth GREEN_NEW with no possessionYear on file -> HUMAN_REVIEW (real Kalpataru Vian constraint from Phase 59B: neither can be accepted alone)", () => {
    const field = byKey(BASE_PAYLOAD, { possessionMonth: { value: "June", confidence: "High" } }, "possessionMonth");
    expect(field.classification).toBe("GREEN_NEW");
    const result = decideFieldAutomation(field);
    expect(result.decision).toBe("HUMAN_REVIEW");
  });
});
