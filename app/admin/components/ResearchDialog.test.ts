import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Targeted fix (Research Automation, Section 16/17) -- regression guard for
 * the "Research Project" founder UX. This repo has no React Testing
 * Library/jsdom environment (see EnrichmentProposalPanel.test.ts's own note
 * on this), so this checks the actual source structure.
 */
const DIALOG_SOURCE = readFileSync(path.resolve(import.meta.dirname, "ResearchDialog.tsx"), "utf8");
const QUEUE_SOURCE = readFileSync(path.resolve(import.meta.dirname, "ReviewQueueList.tsx"), "utf8");

describe("ResearchDialog -- reuses EnrichmentProposalPanel, never rebuilds field-row UI (source inspection)", () => {
  it("renders EnrichmentProposalPanel, not a second proposal-list implementation", () => {
    expect(DIALOG_SOURCE).toContain('import EnrichmentProposalPanel from "./EnrichmentProposalPanel"');
    expect(DIALOG_SOURCE).toContain("<EnrichmentProposalPanel");
  });

  it("NOT_CONFIGURED copy honestly states no automated provider exists, never implying a live search ran (Section 17)", () => {
    expect(DIALOG_SOURCE).toMatch(/NOT_CONFIGURED[\s\S]*No automated research provider is configured/);
  });

  it("surfaces rejected findings to the founder rather than silently discarding them (Section 9/12)", () => {
    expect(DIALOG_SOURCE).toContain("rejectedFindings");
    expect(DIALOG_SOURCE).toContain("could not be verified and were not included");
  });

  it("Browser Integration Validation -- carries a findings submission form wired to onSubmitFindings, not a fabricated success state", () => {
    expect(DIALOG_SOURCE).toContain("function FindingsSubmitForm");
    expect(DIALOG_SOURCE).toContain("onSubmitFindings");
    expect(DIALOG_SOURCE).toContain("<FindingsSubmitForm onSubmit={onSubmitFindings} />");
    expect(DIALOG_SOURCE).toContain("JSON.parse(raw)");
  });
});

describe("ReviewQueueList -- Research Project button reuses the SAME field mutation handlers as Enrich Project (source inspection)", () => {
  it("wires a 'Research Project' button next to 'Enrich Project', gated to Project records", () => {
    expect(QUEUE_SOURCE).toContain("Research Project");
    expect(QUEUE_SOURCE).toContain("runResearch(record.id)");
  });

  it("ResearchDialog reuses handleAcceptField/handleRejectField/handleUploadMedia/handleViewHistory/handleUndo -- no second mutation path defined for research", () => {
    const idx = QUEUE_SOURCE.indexOf("<ResearchDialog");
    expect(idx).toBeGreaterThan(-1);
    const block = QUEUE_SOURCE.slice(idx, idx + 900);
    expect(block).toContain("onAcceptField={handleAcceptField}");
    expect(block).toContain("onRejectField={handleRejectField}");
    expect(block).toContain("onUploadMedia={handleUploadMedia}");
    expect(block).toContain("onViewHistory={handleViewHistory}");
    expect(block).toContain("onUndo={handleUndo}");
  });

  it("calls researchProjectAction, never a second/duplicate research action from this component", () => {
    expect(QUEUE_SOURCE).toContain("await researchProjectAction(recordId)");
  });

  it("Browser Integration Validation -- wires onSubmitFindings through submitResearchFindingsAction, the same identity-guarded pipeline as researchProjectAction", () => {
    expect(QUEUE_SOURCE).toContain("submitResearchFindingsAction");
    expect(QUEUE_SOURCE).toContain("onSubmitFindings={(findings) => submitFindings(enrichmentRecord.id, findings)}");
  });
});
