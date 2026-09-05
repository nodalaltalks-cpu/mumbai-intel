import "server-only";
import type { ProjectSchemaInput } from "./project-data";

/**
 * Section-weighted completion engine — Phase 68 retired the old "40/40"
 * philosophy (8 equal sections mirroring every admin tab, including fields
 * like launchDate/totalUnits/metaTitle/videoUrl that no longer matter for a
 * genuinely useful public page) in favor of mirroring the NEW, minimal
 * founder-facing field model instead: the same 6 groups as ProjectForm.tsx's
 * own TABS/PROGRESS_SECTIONS (Project/Pricing/Regulatory/Intelligence/Media/
 * Publishing — Developer is optional by design and deliberately excluded).
 * Every section is worth an equal share; a brand-new project with only its
 * two truly-required fields (name, localityId) set starts at 0% — no section
 * is "free," including Status/Category, which the form intentionally renders
 * with an empty placeholder for a new project (see ProjectForm.tsx) so a
 * `<select>`'s unavoidable non-empty default value can never masquerade as
 * user-entered data.
 */
export interface ProjectCompletionInput {
  name?: string;
  localityId?: string;
  address?: string;
  description?: string;
  priceMinRupees?: number;
  reraNumber?: string;
  isPublished: boolean;
  amenityCount: number;
  imageCount: number;
}

interface CompletionSection {
  key: string;
  label: string;
  isComplete: (input: ProjectCompletionInput) => boolean;
}

export const PROJECT_COMPLETION_SECTIONS: CompletionSection[] = [
  { key: "project", label: "Project", isComplete: (i) => Boolean(i.name) && Boolean(i.localityId) && Boolean(i.address) },
  { key: "pricing", label: "Pricing & Configuration", isComplete: (i) => Boolean(i.priceMinRupees) },
  { key: "regulatory", label: "Regulatory", isComplete: (i) => Boolean(i.reraNumber) },
  { key: "intelligence", label: "Intelligence", isComplete: (i) => Boolean(i.description) },
  { key: "media", label: "Media", isComplete: (i) => i.imageCount > 0 },
  { key: "publishing", label: "Publishing", isComplete: (i) => i.isPublished === true },
];

export function computeProjectCompletionPercent(input: ProjectCompletionInput): number {
  const complete = PROJECT_COMPLETION_SECTIONS.filter((s) => s.isComplete(input)).length;
  return Math.round((complete / PROJECT_COMPLETION_SECTIONS.length) * 100);
}

/** Builds a ProjectCompletionInput from the admin form's parsed data — the server-side counterpart to ProjectForm.tsx's client-side recomputeProgress(). */
export function completionInputFromSchema(
  data: ProjectSchemaInput,
  amenityCount: number,
  imageCount: number
): ProjectCompletionInput {
  return {
    name: data.name,
    localityId: data.localityId,
    address: data.address,
    description: data.description,
    priceMinRupees: data.priceMinRupees,
    reraNumber: data.reraNumber,
    isPublished: data.isPublished,
    amenityCount,
    imageCount,
  };
}
