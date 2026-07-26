"use server";

import { requireSession } from "@/lib/auth/guard";
import { globalSearch, type GlobalSearchResult } from "@/lib/admin-queries";

export async function globalSearchAction(query: string): Promise<GlobalSearchResult> {
  await requireSession();
  return globalSearch(query);
}
