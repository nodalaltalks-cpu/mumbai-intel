"use server";

import { getProjectsForCompare, type CompareProject } from "@/lib/queries/compare";

/** Server-side lookup for the client-only /compare page (its slug list lives in localStorage, not on the server). */
export async function getProjectsForCompareAction(slugs: string[]): Promise<CompareProject[]> {
  return getProjectsForCompare(slugs.slice(0, 4));
}
