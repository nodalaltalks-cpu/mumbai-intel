"use server";

import { searchPublic, type PublicSearchResult } from "@/lib/queries";
import { recordSearchAction } from "@/lib/actions/search-history";

/** Public, unauthenticated search — the client GlobalSearch component can't call a non-"use server" function directly. */
export async function publicSearchAction(query: string): Promise<PublicSearchResult> {
  await recordSearchAction(query);
  return searchPublic(query);
}
