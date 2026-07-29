import "server-only";
import type { ProjectSchemaInput } from "./project-data";

/**
 * Section-weighted completion engine — mirrors the admin ProjectForm's own
 * tabs (General/Location/Pricing/Construction/Amenities/Media/SEO/Publishing)
 * so the persisted `Project.completionPercent` and the form's live indicator
 * measure the same thing. Every section is worth an equal share; a brand-new
 * project with only its two truly-required fields (name, localityId) set
 * starts at 0% — no section is "free," including Status/Category, which the
 * form intentionally renders with an empty placeholder for a new project
 * (see ProjectForm.tsx) so a `<select>`'s unavoidable non-empty default value
 * can never masquerade as user-entered data.
 */
export interface ProjectCompletionInput {
  name?: string;
  localityId?: string;
  address?: string;
  description?: string;
  priceMinRupees?: number;
  reraNumber?: string;
  launchDate?: Date;
  totalUnits?: number;
  metaTitle?: string;
  metaDescription?: string;
  videoUrl?: string;
  tour360Url?: string;
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
  { key: "general", label: "General", isComplete: (i) => Boolean(i.name) && Boolean(i.description) },
  { key: "location", label: "Location", isComplete: (i) => Boolean(i.localityId) && Boolean(i.address) },
  { key: "pricing", label: "Pricing", isComplete: (i) => Boolean(i.priceMinRupees) && Boolean(i.reraNumber) },
  { key: "construction", label: "Construction", isComplete: (i) => Boolean(i.launchDate) && Boolean(i.totalUnits) },
  { key: "amenities", label: "Amenities", isComplete: (i) => i.amenityCount > 0 },
  { key: "media", label: "Media", isComplete: (i) => i.imageCount > 0 || Boolean(i.videoUrl) || Boolean(i.tour360Url) },
  { key: "seo", label: "SEO", isComplete: (i) => Boolean(i.metaTitle) && Boolean(i.metaDescription) },
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
    launchDate: data.launchDate,
    totalUnits: data.totalUnits,
    metaTitle: data.metaTitle,
    metaDescription: data.metaDescription,
    videoUrl: data.videoUrl,
    tour360Url: data.tour360Url,
    isPublished: data.isPublished,
    amenityCount,
    imageCount,
  };
}
