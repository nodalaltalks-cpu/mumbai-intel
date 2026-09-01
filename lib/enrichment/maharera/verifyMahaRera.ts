import { classifyMahaReraMatch } from "./matchMahaRera";
import { fetchMahaReraRecords } from "./fetchMahaRera";
import type { MahaRERAMatchInput, MahaRERAMatchResult, MahaRERARecord } from "./types";

/**
 * Public entry point (Phase 52 Part E-K): attempts a real, live MahaRERA
 * lookup and classifies the result. Never fabricates -- a failed/blocked
 * fetch always produces UNAVAILABLE, and UNAVAILABLE is never silently
 * treated as NO_MATCH by any caller (Part I).
 *
 * `fetcher` is injectable (defaults to the real fetchMahaReraRecords) purely
 * so tests can exercise classifyMahaReraMatch's own branches deterministically
 * without depending on live network state -- production code always calls
 * this with the default.
 */
export async function verifyProjectAgainstMahaRera(
  input: MahaRERAMatchInput,
  fetcher: (searchTerm: string) => Promise<MahaRERARecord[] | null> = fetchMahaReraRecords
): Promise<MahaRERAMatchResult> {
  const records = await fetcher(input.officialProjectName);
  if (records === null) {
    return { classification: "UNAVAILABLE", reason: "MahaRERA could not be reached or verified reliably (connection failure, access restriction, or CAPTCHA) -- no bypass was attempted." };
  }
  return classifyMahaReraMatch(input, records);
}
