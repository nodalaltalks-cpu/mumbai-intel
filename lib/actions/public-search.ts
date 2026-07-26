"use server";

import { searchPublic, type PublicSearchResult } from "@/lib/queries";

/** Public, unauthenticated search — the client GlobalSearch component can't call a non-"use server" function directly. */
export async function publicSearchAction(query: string): Promise<PublicSearchResult> {
  return searchPublic(query);
}
