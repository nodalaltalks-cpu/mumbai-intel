"use server";

import { searchPublic, type PublicSearchResult } from "@/lib/queries";
import { recordSearchAction } from "@/lib/actions/search-history";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

const EMPTY_RESULT: PublicSearchResult = { projects: [], builders: [], localities: [] };
const MAX_QUERY_LENGTH = 100;

/**
 * Public, unauthenticated search — the client GlobalSearch component can't
 * call a non-"use server" function directly. Length cap + rate limit match
 * the hardening every other public mutation/write action already has
 * (newsletter.ts, contact.ts, public-auth.ts) — this one previously accepted
 * an unbounded query string with no throttling.
 */
export async function publicSearchAction(query: string): Promise<PublicSearchResult> {
  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!trimmed) return EMPTY_RESULT;

  const ip = await getClientIp();
  const limit = checkRateLimit(`public-search:${ip}`, 30, 60);
  if (!limit.allowed) return EMPTY_RESULT;

  await recordSearchAction(trimmed);
  return searchPublic(trimmed);
}
