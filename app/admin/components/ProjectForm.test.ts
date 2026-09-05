import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 68.1 -- regression test for a real bug: CoverImageUploader (like
 * BrochureUploader, ImageUploader, FloorPlanUploader, DocumentsManager, ...)
 * renders its own `<form>`. ProjectForm.tsx used to render CoverImageUploader
 * directly inside its own outer `<form>` (in the Media tab) -- a `<form>`
 * nested inside another `<form>` is invalid HTML, so the browser's real DOM
 * silently disagreed with React's tree. That corrupted what
 * `new FormData(formRef.current)` captured on every autosave/save, so edits
 * to fields like address/builderId/isPublished could go missing with no
 * visible error (see ProjectForm.tsx's onBlur={scheduleAutosave}).
 *
 * The fix: CoverImageUploader now renders as its own sibling card on the edit
 * page (app/admin/(dashboard)/projects/[id]/edit/page.tsx), exactly like
 * every other post-creation manager already did (ConfigurationsManager,
 * BrochureUploader, ImageUploader, ...) -- never inside ProjectForm's <form>.
 *
 * This repo has no React Testing Library/jsdom environment (every existing
 * test targets a plain function under vitest's "node" environment -- see
 * vitest.config.ts and StickyHorizontalScrollbar.test.ts's own note on this),
 * and ProjectForm pulls in a Tiptap-based rich text editor that can't render
 * outside a real browser DOM anyway -- so this guards the actual invariant
 * (no form-rendering uploader composed inside ProjectForm's own form) at the
 * source level instead of attempting a fragile full render.
 */
const PROJECT_FORM_SOURCE = readFileSync(path.resolve(import.meta.dirname, "ProjectForm.tsx"), "utf8");
const EDIT_PAGE_SOURCE = readFileSync(
  path.resolve(import.meta.dirname, "../(dashboard)/projects/[id]/edit/page.tsx"),
  "utf8"
);

// Every sibling component on the edit page that is known to render its own <form>
// (confirmed by inspection, not guessed) -- none of these may ever be imported into
// ProjectForm.tsx, since ProjectForm.tsx's own top-level element is itself a <form>.
const FORM_RENDERING_UPLOADERS = [
  "CoverImageUploader",
  "BrochureUploader",
  "ImageUploader",
  "FloorPlanUploader",
  "DocumentsManager",
  "ConfigurationsManager",
  "PaymentPlansManager",
  "SpecificationsManager",
  "NearbyPlacesManager",
  "ProjectSectionsManager",
  "ProjectTimelineManager",
  "ProjectFaqsManager",
  "InvestmentNotesManager",
];

describe("ProjectForm — no nested <form> regression (Phase 68.1)", () => {
  it("does not render (JSX-instantiate) any form-rendering uploader/manager component inside its own <form>", () => {
    // Checks JSX usage (`<ComponentName`) specifically, not mere text presence --
    // ProjectForm.tsx legitimately imports plain *types* from several of these same
    // files (e.g. `import type { ConfigurationRow } from "./ConfigurationsManager"`),
    // which is fine and unrelated to the nested-<form> hazard this guards against.
    for (const componentName of FORM_RENDERING_UPLOADERS) {
      expect(PROJECT_FORM_SOURCE).not.toMatch(new RegExp(`<${componentName}[\\s/>]`));
    }
  });

  it("its own top-level element really is still a <form> (sanity check the guard above is meaningful)", () => {
    expect(PROJECT_FORM_SOURCE).toMatch(/<form\s/);
  });
});

/**
 * Phase 68.1 -- the second, more direct root cause of the reported bug: metaTitle/
 * metaDescription are hidden "preserve unchanged" carry-through inputs (see the Publishing
 * tab), and a handful of existing projects already had a metaTitle/metaDescription longer
 * than lib/project-data.ts's projectSchema allows (70/160 chars) -- submitting that value
 * unclamped made parseProjectForm() reject the WHOLE save with no visible error, silently
 * blocking address/developer/publish-state edits too. Fixed by clamping the hidden inputs'
 * defaultValue with `.slice(0, 70)` / `.slice(0, 160)` — see lib/project-data.test.ts for the
 * corresponding parseProjectForm-level coverage of why the clamp has to sit here.
 */
describe("ProjectForm — metaTitle/metaDescription hidden inputs stay within schema limits (Phase 68.1)", () => {
  it("clamps the hidden metaTitle input to 70 characters", () => {
    expect(PROJECT_FORM_SOURCE).toMatch(/name="metaTitle"\s+defaultValue=\{[^}]*\.slice\(0,\s*70\)\}/);
  });

  it("clamps the hidden metaDescription input to 160 characters", () => {
    expect(PROJECT_FORM_SOURCE).toMatch(/name="metaDescription"\s+defaultValue=\{[^}]*\.slice\(0,\s*160\)\}/);
  });
});

describe("Edit project page — CoverImageUploader renders as its own sibling card (Phase 68.1)", () => {
  it("imports CoverImageUploader", () => {
    expect(EDIT_PAGE_SOURCE).toMatch(/import CoverImageUploader from ["'].*CoverImageUploader["']/);
  });

  it("renders <CoverImageUploader ... /> after ProjectForm's own wrapping element closes, not inside it", () => {
    const projectFormIndex = EDIT_PAGE_SOURCE.indexOf("<ProjectForm");
    const coverImageUploaderIndex = EDIT_PAGE_SOURCE.indexOf("<CoverImageUploader");
    expect(projectFormIndex).toBeGreaterThan(-1);
    expect(coverImageUploaderIndex).toBeGreaterThan(-1);
    // ProjectForm self-closes with "/>" (it takes no children) -- CoverImageUploader
    // must appear textually after that self-close, i.e. as a sibling, not nested inside it.
    const projectFormSelfCloseIndex = EDIT_PAGE_SOURCE.indexOf("/>", projectFormIndex);
    expect(projectFormSelfCloseIndex).toBeGreaterThan(-1);
    expect(coverImageUploaderIndex).toBeGreaterThan(projectFormSelfCloseIndex);
  });
});
