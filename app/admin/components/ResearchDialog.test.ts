import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Targeted fix (Research Project UX) -- regression guard for the rebuilt
 * "Research Project" founder UX (5-step Claude+Chrome workflow: Plan, Copy
 * Task, Paste Findings, Submit, Result). This repo has no React Testing
 * Library/jsdom environment (see EnrichmentProposalPanel.test.ts's own note
 * on this), so this checks the actual source structure -- the same
 * convention every other dialog test file in this directory already uses.
 */
const DIALOG_SOURCE = readFileSync(path.resolve(import.meta.dirname, "ResearchDialog.tsx"), "utf8");
const QUEUE_SOURCE = readFileSync(path.resolve(import.meta.dirname, "ReviewQueueList.tsx"), "utf8");

describe("ResearchDialog -- Step 1/2: Research Plan renders project identity, target fields, queries (items 1-3)", () => {
  it("1. renders project identity (name/developer/locality/RERA) from the plan's task", () => {
    expect(DIALOG_SOURCE).toContain("task.project.name");
    expect(DIALOG_SOURCE).toContain("task.project.developer");
    expect(DIALOG_SOURCE).toContain("task.project.locality");
    expect(DIALOG_SOURCE).toContain("task.project.reraNumber");
  });

  it("2. renders the target field list with human-readable labels, not raw registry keys", () => {
    expect(DIALOG_SOURCE).toContain("task.targetFields.map");
    expect(DIALOG_SOURCE).toContain("fieldLabel(key)");
    expect(DIALOG_SOURCE).toContain('developerWebsiteUrl: "Official Developer Website"');
  });

  it("3. renders the generated research queries, de-duplicated across fields", () => {
    expect(DIALOG_SOURCE).toContain("flattenQueries(task.queries)");
    expect(DIALOG_SOURCE).toContain("queries.map((q, i)");
  });
});

describe("ResearchDialog -- Step 2: Copy Research Task (items 4-9)", () => {
  it("4. a prominent Copy Research Task action exists and uses the real clipboard API", () => {
    expect(DIALOG_SOURCE).toContain("Copy research task");
    expect(DIALOG_SOURCE).toContain("navigator.clipboard.writeText");
    expect(DIALOG_SOURCE).toContain("✓ Research task copied");
  });

  it("5. the copied task text includes exact project identity", () => {
    const idx = DIALOG_SOURCE.indexOf("function buildCopyText");
    expect(idx).toBeGreaterThan(-1);
    const body = DIALOG_SOURCE.slice(idx, DIALOG_SOURCE.indexOf("\n}", idx));
    expect(body).toContain("task.project.name");
    expect(body).toContain("task.project.developer");
    expect(body).toContain("task.project.locality");
    expect(body).toContain("task.project.reraNumber");
  });

  it("6. the copied task text includes the generated research queries", () => {
    const idx = DIALOG_SOURCE.indexOf("function buildCopyText");
    const body = DIALOG_SOURCE.slice(idx, DIALOG_SOURCE.indexOf("\n}", idx));
    expect(body).toContain("RESEARCH QUERIES");
    expect(body).toContain("flattenQueries(task.queries)");
  });

  it("7. the copied task text includes source hierarchy, identity rules, and safety rules", () => {
    const idx = DIALOG_SOURCE.indexOf("function buildCopyText");
    const body = DIALOG_SOURCE.slice(idx, DIALOG_SOURCE.indexOf("\n}", idx));
    expect(body).toContain("SOURCE PRIORITY");
    expect(body).toContain("task.sourceRules");
    expect(body).toContain("IDENTITY VERIFICATION RULES");
    expect(body).toContain("task.identityRules");
    expect(body).toContain("SAFETY RULES");
    expect(body).toContain("task.safetyRules");
  });

  it("8. the copied task text includes the required JSON output format the founder/Claude must follow", () => {
    const idx = DIALOG_SOURCE.indexOf("function buildCopyText");
    const body = DIALOG_SOURCE.slice(idx, DIALOG_SOURCE.indexOf("\n}", idx));
    expect(body).toContain("REQUIRED_OUTPUT_FORMAT");
    expect(DIALOG_SOURCE).toContain('"field": "address"');
    expect(DIALOG_SOURCE).toContain('"proposedValue"');
    expect(DIALOG_SOURCE).toContain('"identitySignals"');
  });

  it("9. the required-output-format template and copy-text builder never hardcode a secret or credential value", () => {
    const forbidden = ["database_url", "api_key", "apikey", "process.env", "secret_key", "auth_token", "bearer "];
    const haystack = REQUIRED_OUTPUT_FORMAT_SOURCE().toLowerCase();
    for (const f of forbidden) {
      expect(haystack).not.toContain(f);
    }
  });
});

function REQUIRED_OUTPUT_FORMAT_SOURCE(): string {
  const start = DIALOG_SOURCE.indexOf("const REQUIRED_OUTPUT_FORMAT");
  const end = DIALOG_SOURCE.indexOf("function buildCopyText");
  return DIALOG_SOURCE.slice(start, end);
}

describe("ResearchDialog -- Step 3/4: Paste findings + Submit (items 10-11)", () => {
  it("10. a paste-findings form exists, parses JSON, and maps the simple founder-facing schema to the internal ResearchFinding shape without requiring internal type knowledge", () => {
    expect(DIALOG_SOURCE).toContain("function FindingsSubmitForm");
    expect(DIALOG_SOURCE).toContain("JSON.parse(raw)");
    expect(DIALOG_SOURCE).toContain("function mapPastedFinding");
    // simple schema keys in, internal keys out -- the founder never writes fieldKey/reasoning themselves
    expect(DIALOG_SOURCE).toContain("r.field ?? r.fieldKey");
    expect(DIALOG_SOURCE).toContain("r.proposedValue ?? r.value");
    expect(DIALOG_SOURCE).toContain("r.evidence ?? r.reasoning");
  });

  it("10b. malformed pasted entries are reported to the founder rather than silently dropped or crashing", () => {
    expect(DIALOG_SOURCE).toContain("could not be understood");
    expect(DIALOG_SOURCE).toContain("setSkipped(skippedReasons)");
  });

  it("11. Submit still calls the existing onSubmitFindings prop, which ReviewQueueList wires to the real submitResearchFindingsAction -- no new/duplicate submission action", () => {
    expect(DIALOG_SOURCE).toContain("onSubmit(findings)");
    expect(QUEUE_SOURCE).toContain("submitResearchFindingsAction");
    expect(QUEUE_SOURCE).toContain("onSubmitFindings={(findings) => submitFindings(enrichmentRecord.id, findings)}");
    // exactly one call site for submitResearchFindingsAction -- not a second/parallel review mechanism
    const occurrences = (QUEUE_SOURCE.match(/submitResearchFindingsAction\(/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});

describe("ResearchDialog -- Step 5: Result + existing review flow unchanged (items 12-13)", () => {
  it("12. reuses EnrichmentProposalPanel unchanged -- no second proposal-list implementation, and the founder's Accept/Edit/Reject/View History handlers pass through unmodified", () => {
    expect(DIALOG_SOURCE).toContain('import EnrichmentProposalPanel from "./EnrichmentProposalPanel"');
    expect(DIALOG_SOURCE).toContain("<EnrichmentProposalPanel");
    const idx = QUEUE_SOURCE.indexOf("<ResearchDialog");
    expect(idx).toBeGreaterThan(-1);
    const block = QUEUE_SOURCE.slice(idx, idx + 1200);
    expect(block).toContain("onAcceptField={handleAcceptField}");
    expect(block).toContain("onRejectField={handleRejectField}");
    expect(block).toContain("onUploadMedia={handleUploadMedia}");
    expect(block).toContain("onViewHistory={handleViewHistory}");
    expect(block).toContain("onUndo={handleUndo}");
  });

  it("12b. shows a real Step 5 result summary (submitted/accepted/rejected/conflict/no-source), computed from the actual submission and identity-guard result, not fabricated", () => {
    expect(DIALOG_SOURCE).toContain("function ResultSummary");
    expect(DIALOG_SOURCE).toContain("accepted into review");
    expect(DIALOG_SOURCE).toContain("rejected by identity guard");
    expect(DIALOG_SOURCE).toContain("conflict");
    expect(DIALOG_SOURCE).toContain("no-source");
  });

  it("13. rejected findings remain visible with field/reason/source -- never silently discarded", () => {
    expect(DIALOG_SOURCE).toContain("rejectedFindings");
    expect(DIALOG_SOURCE).toContain("could not be verified and were not included");
    expect(DIALOG_SOURCE).toContain("r.fieldKey");
    expect(DIALOG_SOURCE).toContain("r.sourceUrl");
    expect(DIALOG_SOURCE).toContain("r.reason");
  });
});

describe("ResearchDialog -- UX framing: NOT_CONFIGURED is not an error state", () => {
  it("leads with the Claude + Chrome workflow, not a dead-end error message", () => {
    expect(DIALOG_SOURCE).toContain("Research this project with Claude + Chrome");
    // NOT_CONFIGURED is no longer a distinct stop-status key/case (only mentioned in prose comments) --
    // it falls through to the same "Research this project with Claude + Chrome" path as any other status.
    expect(DIALOG_SOURCE).not.toContain("NOT_CONFIGURED:");
    expect(DIALOG_SOURCE).not.toMatch(/status === "NOT_CONFIGURED"/);
  });

  it("does not make Try Again the dominant action when there is nothing automated to retry -- it only appears for a genuine ERROR/NOT_FOUND stop", () => {
    const idx = DIALOG_SOURCE.indexOf("Try again");
    expect(idx).toBeGreaterThan(-1);
    const before = DIALOG_SOURCE.slice(Math.max(0, idx - 400), idx);
    expect(before).toContain('hardStopStatus === "ERROR"');
    expect(before).toContain('hardStopStatus === "NOT_FOUND"');
  });

  it("a genuine stop condition (out of scope) is still reported honestly", () => {
    expect(DIALOG_SOURCE).toContain("This project is outside Mumbai city");
  });
});

describe("ResearchDialog -- item 14: mobile-safe layout / no nested scroll trap", () => {
  it("does not add a second scrollable region inside Dialog's own already-scrollable body", () => {
    // Dialog.tsx's own body wrapper is already min-h-0 flex-1 overflow-y-auto --
    // a second overflow-y-auto/max-h wrapper here would be a nested scroll trap.
    expect(DIALOG_SOURCE).not.toMatch(/overflow-y-auto/);
    expect(DIALOG_SOURCE).not.toMatch(/max-h-\[/);
  });

  it("target fields wrap on narrow viewports instead of forcing horizontal scroll", () => {
    expect(DIALOG_SOURCE).toContain("flex-wrap");
  });

  it("Dialog is still opened with a bounded max-width, not an unbounded/full-screen modal", () => {
    expect(DIALOG_SOURCE).toContain('maxWidth="max-w-2xl"');
  });
});

describe("ReviewQueueList -- Research Project wiring (source inspection)", () => {
  it("wires a 'Research Project' button next to 'Enrich Project', gated to Project records", () => {
    expect(QUEUE_SOURCE).toContain("Research Project");
    expect(QUEUE_SOURCE).toContain("runResearch(record.id)");
  });

  it("calls researchProjectAction, never a second/duplicate research action from this component", () => {
    expect(QUEUE_SOURCE).toContain("await researchProjectAction(recordId)");
  });

  it("fetches the read-only research plan via the existing buildResearchPlanAction (no new server logic) and passes it to the dialog", () => {
    expect(QUEUE_SOURCE).toContain("buildResearchPlanAction");
    expect(QUEUE_SOURCE).toContain("plan={researchPlanState?.plan ?? null}");
  });
});
