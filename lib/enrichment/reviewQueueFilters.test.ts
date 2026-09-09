import { describe, expect, it } from "vitest";
import {
  matchesStatusFilter,
  matchesResearchStatusFilter,
  matchesOriginFilter,
  matchesSearch,
  matchesAllFilters,
  normalizeSearchQuery,
  type FilterableReviewRecord,
} from "./reviewQueueFilters";
import type { ProjectResearchActivity } from "./researchAttribution";

function record(overrides: Partial<FilterableReviewRecord> = {}): FilterableReviewRecord {
  return {
    enrichmentBadge: null,
    readiness: null,
    researchActivity: null,
    localityName: null,
    developerName: null,
    searchableText: null,
    ...overrides,
  };
}

function activity(overrides: Partial<ProjectResearchActivity> = {}): ProjectResearchActivity {
  return {
    hasResearch: true,
    providerLabel: "Claude + Chrome",
    lastResearchAt: "2026-09-07T00:00:00.000Z",
    hasFounderEdit: false,
    passedVerification: 1,
    rejectedByVerification: 0,
    accepted: 0,
    founderEdited: 0,
    rejected: 0,
    conflicts: 0,
    pending: 0,
    fields: [],
    ...overrides,
  };
}

describe("normalizeSearchQuery", () => {
  it("1. lowercases and collapses whitespace", () => {
    expect(normalizeSearchQuery("  Andheri   West  ")).toBe("andheri west");
  });
});

describe("matchesSearch (Part 1 -- name/developer/locality/RERA/address)", () => {
  it("2. matches by project name", () => {
    expect(matchesSearch(record({ searchableText: "linkbay residences   rustomjee   andheri west" }), "linkbay")).toBe(true);
  });
  it("3. matches by developer", () => {
    expect(matchesSearch(record({ searchableText: "godrej skyshore   godrej properties   andheri west" }), "godrej properties")).toBe(true);
  });
  it("4. matches by locality", () => {
    expect(matchesSearch(record({ searchableText: "godrej skyshore   godrej properties   andheri west" }), "andheri west")).toBe(true);
  });
  it("5. matches by RERA number", () => {
    expect(matchesSearch(record({ searchableText: "linkbay residences   p51800047539" }), "p51800047539")).toBe(true);
  });
  it("6. matches by address", () => {
    expect(matchesSearch(record({ searchableText: "linkbay residences   s.v. road, andheri west" }), "s.v. road")).toBe(true);
  });
  it("7. is case-insensitive", () => {
    expect(matchesSearch(record({ searchableText: "linkbay residences" }), normalizeSearchQuery("LINKBAY"))).toBe(true);
  });
  it("empty query matches everything, including a record with no searchable text at all", () => {
    expect(matchesSearch(record({ searchableText: null }), "")).toBe(true);
  });
  it("no match returns false", () => {
    expect(matchesSearch(record({ searchableText: "linkbay residences" }), "godrej")).toBe(false);
  });
});

describe("matchesStatusFilter", () => {
  it("APPROVAL_READY matches only readiness.status === READY", () => {
    expect(matchesStatusFilter(record({ readiness: { status: "READY", neededFieldLabels: [], missingFieldLabels: [] } }), "APPROVAL_READY")).toBe(true);
    expect(matchesStatusFilter(record({ readiness: { status: "NEEDS_ATTENTION", neededFieldLabels: ["x"], missingFieldLabels: [] } }), "APPROVAL_READY")).toBe(false);
  });
  it("CONFLICTS matches conflictCount > 0", () => {
    expect(matchesStatusFilter(record({ enrichmentBadge: { status: "READY", proposedCount: 2, conflictCount: 1, lastRunAt: null } }), "CONFLICTS")).toBe(true);
    expect(matchesStatusFilter(record({ enrichmentBadge: { status: "READY", proposedCount: 2, conflictCount: 0, lastRunAt: null } }), "CONFLICTS")).toBe(false);
  });
  it("NOT_ENRICHED matches NOT_RUN status", () => {
    expect(matchesStatusFilter(record({ enrichmentBadge: { status: "NOT_RUN", proposedCount: 0, conflictCount: 0, lastRunAt: null } }), "NOT_ENRICHED")).toBe(true);
  });
  it("ALL always matches", () => {
    expect(matchesStatusFilter(record(), "ALL")).toBe(true);
  });
});

describe("matchesResearchStatusFilter (Part 2/8)", () => {
  it("8. RESEARCHED matches only when hasResearch is real persisted evidence", () => {
    expect(matchesResearchStatusFilter(record({ researchActivity: activity({ hasResearch: true }) }), "RESEARCHED")).toBe(true);
    expect(matchesResearchStatusFilter(record({ researchActivity: null }), "RESEARCHED")).toBe(false);
  });
  it("NOT_RESEARCHED matches records with no research activity, including null", () => {
    expect(matchesResearchStatusFilter(record({ researchActivity: null }), "NOT_RESEARCHED")).toBe(true);
    expect(matchesResearchStatusFilter(record({ researchActivity: activity({ hasResearch: false }) }), "NOT_RESEARCHED")).toBe(true);
    expect(matchesResearchStatusFilter(record({ researchActivity: activity({ hasResearch: true }) }), "NOT_RESEARCHED")).toBe(false);
  });
  it("HAS_CHANGES matches accepted or founder-edited findings", () => {
    expect(matchesResearchStatusFilter(record({ researchActivity: activity({ accepted: 1 }) }), "HAS_CHANGES")).toBe(true);
    expect(matchesResearchStatusFilter(record({ researchActivity: activity({ founderEdited: 1 }) }), "HAS_CHANGES")).toBe(true);
    expect(matchesResearchStatusFilter(record({ researchActivity: activity({ accepted: 0, founderEdited: 0 }) }), "HAS_CHANGES")).toBe(false);
  });
  it("HAS_CONFLICTS matches only unresolved research conflicts", () => {
    expect(matchesResearchStatusFilter(record({ researchActivity: activity({ conflicts: 1 }) }), "HAS_CONFLICTS")).toBe(true);
    expect(matchesResearchStatusFilter(record({ researchActivity: activity({ conflicts: 0 }) }), "HAS_CONFLICTS")).toBe(false);
  });
});

describe("matchesOriginFilter (Part 2/12 -- origin distinguishability)", () => {
  it("9. ORIGINAL_INGESTION matches an untouched record (never enriched, never researched)", () => {
    expect(matchesOriginFilter(record(), "ORIGINAL_INGESTION")).toBe(true);
    expect(matchesOriginFilter(record({ enrichmentBadge: { status: "READY", proposedCount: 0, conflictCount: 0, lastRunAt: "x" } }), "ORIGINAL_INGESTION")).toBe(false);
  });
  it("AUTOMATIC_ENRICHMENT matches any record an Enrich run has touched", () => {
    expect(matchesOriginFilter(record({ enrichmentBadge: { status: "READY", proposedCount: 0, conflictCount: 0, lastRunAt: "x" } }), "AUTOMATIC_ENRICHMENT")).toBe(true);
    expect(matchesOriginFilter(record(), "AUTOMATIC_ENRICHMENT")).toBe(false);
  });
  it("10. RESEARCH matches records with real research evidence, and is distinguishable from a founder edit alone", () => {
    expect(matchesOriginFilter(record({ researchActivity: activity({ hasResearch: true, hasFounderEdit: false }) }), "RESEARCH")).toBe(true);
    expect(matchesOriginFilter(record({ researchActivity: activity({ hasResearch: false, hasFounderEdit: true }) }), "RESEARCH")).toBe(false);
  });
  it("11. FOUNDER_EDITED matches project-wide founder edits independent of research", () => {
    expect(matchesOriginFilter(record({ researchActivity: activity({ hasResearch: false, hasFounderEdit: true }) }), "FOUNDER_EDITED")).toBe(true);
    expect(matchesOriginFilter(record({ researchActivity: null }), "FOUNDER_EDITED")).toBe(false);
  });
});

describe("matchesAllFilters (Part 2 -- filters combine correctly)", () => {
  it("12. locality + research + status all apply as AND, not OR", () => {
    const match = record({
      localityName: "Andheri West",
      readiness: { status: "READY", neededFieldLabels: [], missingFieldLabels: [] },
      researchActivity: activity({ hasResearch: true }),
    });
    expect(
      matchesAllFilters(match, { search: "", status: "APPROVAL_READY", research: "RESEARCHED", origin: "ALL", locality: "Andheri West", developer: "" })
    ).toBe(true);
    // Same record, wrong locality -> excluded even though every other filter still matches.
    expect(
      matchesAllFilters(match, { search: "", status: "APPROVAL_READY", research: "RESEARCHED", origin: "ALL", locality: "Bandra West", developer: "" })
    ).toBe(false);
  });

  it("developer filter is exact-match, empty string means unfiltered", () => {
    const r = record({ developerName: "Rustomjee" });
    expect(matchesAllFilters(r, { search: "", status: "ALL", research: "ALL", origin: "ALL", locality: "", developer: "Rustomjee" })).toBe(true);
    expect(matchesAllFilters(r, { search: "", status: "ALL", research: "ALL", origin: "ALL", locality: "", developer: "Godrej" })).toBe(false);
    expect(matchesAllFilters(r, { search: "", status: "ALL", research: "ALL", origin: "ALL", locality: "", developer: "" })).toBe(true);
  });
});
