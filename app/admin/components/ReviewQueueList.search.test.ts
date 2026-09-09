import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Founder Review Queue — Search + Agent Change Visibility.
 *
 * Source-inspection regression guard (this repo has no jsdom/React Testing
 * Library environment -- see EnrichmentProposalPanel.test.ts's own note) for
 * ReviewQueueList.tsx's search/filter/agent-visibility wiring. The actual
 * filtering LOGIC is unit-tested for real in reviewQueueFilters.test.ts;
 * this file only checks that the component wires that logic in correctly
 * and leaves the pre-existing Approve/Reject/Enrich/Research workflow
 * untouched.
 */
const QUEUE_SOURCE = readFileSync(path.resolve(import.meta.dirname, "ReviewQueueList.tsx"), "utf8");

describe("ReviewQueueList -- search bar (Part 1/8/14)", () => {
  it("1. renders a visible search input with the specified placeholder", () => {
    expect(QUEUE_SOURCE).toContain('placeholder="Search projects, RERA, developer, locality..."');
  });

  it("debounces the search input before it affects filtering/URL state", () => {
    expect(QUEUE_SOURCE).toContain("setTimeout(() => setSearchQuery(normalizeSearchQuery(searchInput)), 250)");
  });

  it("never reimplements filtering logic locally -- imports the real predicates from the pure lib module", () => {
    expect(QUEUE_SOURCE).toContain('from "@/lib/enrichment/reviewQueueFilters"');
    expect(QUEUE_SOURCE).toContain("matchesAllFilters(r,");
  });
});

describe("ReviewQueueList -- filters (Part 2)", () => {
  it("2. Status filter offers Approval Ready alongside the pre-existing options", () => {
    expect(QUEUE_SOURCE).toContain('<option value="APPROVAL_READY">Approval ready</option>');
  });

  it("3. Research Status filter offers all four required options", () => {
    expect(QUEUE_SOURCE).toContain('<option value="RESEARCHED">Researched by agent</option>');
    expect(QUEUE_SOURCE).toContain('<option value="NOT_RESEARCHED">Not researched</option>');
    expect(QUEUE_SOURCE).toContain('<option value="HAS_CHANGES">Research has changes</option>');
    expect(QUEUE_SOURCE).toContain('<option value="HAS_CONFLICTS">Research has conflicts</option>');
  });

  it("4. Origin filter offers all four required options", () => {
    expect(QUEUE_SOURCE).toContain('<option value="ORIGINAL_INGESTION">Original ingestion</option>');
    expect(QUEUE_SOURCE).toContain('<option value="AUTOMATIC_ENRICHMENT">Automatic enrichment</option>');
    expect(QUEUE_SOURCE).toContain('<option value="RESEARCH">Claude/browser research</option>');
    expect(QUEUE_SOURCE).toContain('<option value="FOUNDER_EDITED">Founder edited</option>');
  });

  it("5. Locality filter options are derived from the actual records, never hardcoded", () => {
    expect(QUEUE_SOURCE).toContain("records.map((r) => r.localityName)");
    expect(QUEUE_SOURCE).not.toMatch(/"Andheri West"|"Bandra West"/);
  });

  it("6. Developer filter options are derived from the actual records, never hardcoded", () => {
    expect(QUEUE_SOURCE).toContain("records.map((r) => r.developerName)");
  });
});

describe("ReviewQueueList -- agent attribution (Part 3/5) only appears when persisted evidence exists", () => {
  it("7. the research badge is gated on record.researchActivity being present (never rendered merely because a project was enriched)", () => {
    expect(QUEUE_SOURCE).toContain("record.researchActivity ? <ResearchBadgeLine");
  });

  it("8. ResearchBadgeLine itself early-returns null unless activity.hasResearch is true", () => {
    const idx = QUEUE_SOURCE.indexOf("function ResearchBadgeLine");
    const fn = QUEUE_SOURCE.slice(idx, idx + 400);
    expect(fn).toContain("if (!activity.hasResearch) return null;");
  });

  it("clicking the badge opens the read-only Research Changes view, not a second review/edit surface", () => {
    expect(QUEUE_SOURCE).toContain("onOpen={() => setResearchChangesRecordId(record.id)}");
    expect(QUEUE_SOURCE).toContain("researchChangesRecord?.researchActivity ? (");
    expect(QUEUE_SOURCE).toContain("<ResearchChangesDialog");
  });
});

describe("ReviewQueueList -- URL state (Part 9)", () => {
  it("9. seeds every filter's initial state from the URL's search params", () => {
    expect(QUEUE_SOURCE).toContain('searchParams.get("search")');
    expect(QUEUE_SOURCE).toContain('searchParams.get("status")');
    expect(QUEUE_SOURCE).toContain('searchParams.get("research")');
    expect(QUEUE_SOURCE).toContain('searchParams.get("origin")');
    expect(QUEUE_SOURCE).toContain('searchParams.get("locality")');
    expect(QUEUE_SOURCE).toContain('searchParams.get("developer")');
  });

  it("10. writes filter changes back to the URL via router.replace, shallow (no full page reload/refetch)", () => {
    expect(QUEUE_SOURCE).toContain("router.replace(qsString ? `${pathname}?${qsString}` : pathname, { scroll: false })");
  });
});

describe("ReviewQueueList -- Part 10/12: existing Approve/Reject/Enrich/Research workflow is untouched", () => {
  it("11. Approve still calls the exact same existing action, unmodified", () => {
    expect(QUEUE_SOURCE).toContain("approveStagingRecordAction.bind(null, record.id)");
  });

  it("12. Reject still calls the exact same existing action, unmodified", () => {
    expect(QUEUE_SOURCE).toContain("rejectStagingRecordAction.bind(null, record.id)");
  });

  it("13. Enrich Project / Research Project buttons still call the exact same existing handlers", () => {
    expect(QUEUE_SOURCE).toContain("onClick={() => runEnrichment(record.id)}");
    expect(QUEUE_SOURCE).toContain("onClick={() => runResearch(record.id)}");
  });

  it("14. this file writes to no database and defines no server action of its own -- filtering/search is purely a client-side view over already-approved data flows", () => {
    expect(QUEUE_SOURCE).not.toMatch(/prisma\./);
    expect(QUEUE_SOURCE).not.toMatch(/"use server"/);
  });
});
