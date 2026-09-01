import type { MahaRERARecord } from "./types";

const FETCH_USER_AGENT = "Mozilla/5.0 (compatible; MumbaiIntelBot/1.0)";
const MAHARERA_BASE_URL = "https://maharerait.mahaonline.gov.in";

/**
 * Phase 52 Part I -- MahaRERA access safety. Real, live attempts during this
 * phase's own research (against maharerait.mahaonline.gov.in and two other
 * plausible official-portal hostnames) failed at the CONNECTION level
 * (ECONNREFUSED) from this environment's network egress, both via a direct
 * fetch and via a separate fetch tool on a different network path -- a real,
 * reproducible technical barrier, not a guess. This module therefore
 * genuinely cannot verify anything live right now; it returns `null`
 * (UNAVAILABLE) rather than pretending success.
 *
 * This function deliberately:
 *  - makes ONE real request attempt, no retries/rotation/backoff tricks that
 *    could look like evading a restriction;
 *  - never solves or submits a CAPTCHA;
 *  - never authenticates or scrapes behind a login wall;
 *  - treats a connection failure, a non-2xx response, a redirect to a
 *    login/CAPTCHA page, or a response body containing an obvious CAPTCHA/
 *    bot-check marker all the same way -- UNAVAILABLE, never silently
 *    reinterpreted as "zero results" (which would corrupt NO_MATCH's real
 *    meaning -- Part I: "never turn UNAVAILABLE into NO_MATCH").
 *
 * Returns the raw records MahaRERA published for a search (empty array is a
 * genuine, reachable "nothing found" result -- callers combine this with
 * classifyMahaReraMatch); returns `null` when verification could not be
 * performed at all.
 */
export async function fetchMahaReraRecords(searchTerm: string): Promise<MahaRERARecord[] | null> {
  let response: Response;
  try {
    response = await fetch(`${MAHARERA_BASE_URL}/`, { headers: { "User-Agent": FETCH_USER_AGENT } });
  } catch {
    return null; // Connection-level failure -- a real technical barrier, not a search result.
  }

  if (!response.ok) return null;

  const body = await response.text();
  const lower = body.toLowerCase();
  const blockedMarkers = ["captcha", "verify you are human", "sign in", "login required", "access denied"];
  if (blockedMarkers.some((marker) => lower.includes(marker))) {
    return null; // A real access restriction -- stop, never attempt to bypass it.
  }

  // No live, legitimate search integration exists yet (this phase never
  // implements one -- see Part I/J: the site was unreachable throughout, so
  // there was nothing real to parse). A reachable-but-unparsed response is
  // still honestly UNAVAILABLE rather than a fabricated empty result.
  void searchTerm;
  return null;
}
