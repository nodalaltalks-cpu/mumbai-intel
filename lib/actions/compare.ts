"use server";

import { getProjectsForCompare, type CompareProject } from "@/lib/queries/compare";
import { recordResearchEvent } from "@/lib/analytics/research-events";

/** Server-side lookup for the client-only /compare page (its slug list lives in localStorage, not on the server). */
export async function getProjectsForCompareAction(slugs: string[]): Promise<CompareProject[]> {
  const trimmed = slugs.slice(0, 4);
  if (trimmed.length >= 2) {
    await recordResearchEvent("COMPARE_USED", { metadata: { count: trimmed.length } });
  }
  return getProjectsForCompare(trimmed);
}
