"use server";

import { getProjectsForCompare, type CompareProject } from "@/lib/queries/compare";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import { getPublicSession } from "@/lib/public-auth/session";
import { maskProjectBrochure, maskPricePerSqft } from "@/lib/premium/mask";

export type CompareProjectGated = CompareProject & { brochureAvailable: boolean };

/**
 * Server-side lookup for the client-only /compare page (its slug list lives
 * in localStorage, not on the server). Brochure and price/sqft are masked
 * for guests here, before the response ever leaves the server, since this
 * return value becomes the client's in-memory state (and Network-tab
 * response) directly, not just something rendered into HTML — price/sqft is
 * treated as premium everywhere else (ProjectCard, LocalityCard, the project
 * detail page), so it can't be left exposed on this one surface.
 */
export async function getProjectsForCompareAction(slugs: string[]): Promise<CompareProjectGated[]> {
  const trimmed = slugs.slice(0, 4);
  if (trimmed.length >= 2) {
    await recordResearchEvent("COMPARE_USED", { metadata: { count: trimmed.length } });
  }
  const [projects, session] = await Promise.all([getProjectsForCompare(trimmed), getPublicSession()]);
  const locked = session === null;
  return projects.map((p) => {
    const brochureGated = maskProjectBrochure(p, locked);
    return locked ? { ...brochureGated, pricePerSqftLabel: p.pricePerSqftLabel !== null ? maskPricePerSqft() : null } : brochureGated;
  });
}
