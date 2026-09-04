import { describe, expect, it, vi } from "vitest";

// DiscoveryTriagePanel -> DiscoveryCandidateList -> @/lib/actions/builders (a real
// "use server" module whose top-level imports eventually reach @/lib/prisma, which
// throws at import time without a real DATABASE_URL). getTriageBucket itself is a
// pure function and never calls this — mocked purely to make the module graph
// importable under vitest's plain "node" environment (see StickyHorizontalScrollbar.test.ts's
// own doc comment: no React Testing Library/jsdom set up in this repo).
vi.mock("@/lib/actions/builders", () => ({ saveDeveloperWebsiteAction: vi.fn() }));

import { getTriageBucket } from "./DiscoveryTriagePanel";
import type { DiscoveryCandidateRow } from "./DiscoveryCandidateList";
import type { ProjectDiscoveryCandidatePayload } from "@/lib/ingestion/discovery/types";

const BASE_PAYLOAD: ProjectDiscoveryCandidatePayload = {
  projectName: "Test Towers",
  developerName: "Test Developer",
  areaName: "Andheri West",
  batchLabel: "Test Batch",
  sourceUrl: "https://developer.example/projects/test-towers",
  sourceType: "OFFICIAL_DEVELOPER",
  discoverySource: "developer.example sitemap",
  officialDeveloperUrl: "https://developer.example",
  officialSourceStatus: "IDENTIFIED",
  confidence: "High",
  duplicateStatus: "NO_MATCH",
  duplicateMatch: null,
};

function row(overrides: Partial<DiscoveryCandidateRow> = {}): DiscoveryCandidateRow {
  return {
    id: "cand-1",
    status: "SOURCE_FOUND",
    payload: BASE_PAYLOAD,
    matchedExistingName: null,
    liveDuplicateStatus: "NO_MATCH",
    liveDuplicateMatch: null,
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    ...overrides,
  };
}

/**
 * Phase 70 — regression coverage for "successful Include → candidate no
 * longer appears in New Candidates" (the bug report's requirement 3). This
 * doesn't need to render the panel's UI at all: the triage tabs are a pure
 * function of `getTriageBucket(row)`, so proving a fresh candidate's bucket
 * actually changes once its status flips to PROJECT_STAGED is exactly what
 * guarantees it leaves the "New Candidates" (and "Needs Review") filtered
 * view and appears instead under "Included / Staged".
 */
describe("getTriageBucket — Include must move a candidate out of New/Needs Review (Phase 70)", () => {
  it("a fresh, not-yet-decided candidate is bucketed as NEW", () => {
    expect(getTriageBucket(row({ status: "SOURCE_FOUND" }))).toBe("NEW");
    expect(getTriageBucket(row({ status: "DISCOVERED" }))).toBe("NEW");
  });

  it("a candidate marked NEEDS_REVIEW is bucketed as NEEDS_REVIEW, not NEW", () => {
    expect(getTriageBucket(row({ status: "NEEDS_REVIEW" }))).toBe("NEEDS_REVIEW");
  });

  it("after a successful Include (status -> PROJECT_STAGED), the SAME candidate is bucketed as INCLUDED, not NEW/NEEDS_REVIEW", () => {
    const before = row({ status: "SOURCE_FOUND" });
    const after = row({ status: "PROJECT_STAGED" });
    expect(getTriageBucket(before)).toBe("NEW");
    expect(getTriageBucket(after)).toBe("INCLUDED");
    expect(getTriageBucket(after)).not.toBe("NEW");
    expect(getTriageBucket(after)).not.toBe("NEEDS_REVIEW");
  });

  it("a genuine duplicate rejection (status -> REJECTED_DUPLICATE) is bucketed as DUPLICATE, not NEW/NEEDS_REVIEW — duplicate protection stays visibly distinct from a real success", () => {
    const after = row({ status: "REJECTED_DUPLICATE" });
    expect(getTriageBucket(after)).toBe("DUPLICATE");
  });

  it("an unresolved-locality candidate (live re-check returns null) is bucketed as UNRESOLVED rather than NEW", () => {
    const unresolved = row({ status: "SOURCE_FOUND", liveDuplicateStatus: null });
    expect(getTriageBucket(unresolved)).toBe("UNRESOLVED");
  });
});
