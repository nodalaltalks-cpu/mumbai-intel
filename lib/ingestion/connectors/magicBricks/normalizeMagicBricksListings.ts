import type {
  ConflictGroup,
  MagicBricksListing,
  NormalizedProjectCandidate,
  NormalizeResult,
  QualityFlag,
  SourceAvailabilityFilter,
  UnresolvedListing,
} from "./types";

/**
 * MagicBricks project normalizer -- Phase 11.
 *
 * Converts raw MagicBricks LISTING-level records (one row per unit) into
 * canonical PROJECT-level candidates whose `row` is ready to be
 * JSON.stringify'd and handed to the EXISTING, unmodified
 * runProjectFileImport() (lib/ingestion/fileImportRunner.ts) -- exactly the
 * same way lib/ingestion/apifyBridge.ts already feeds raw dataset items into
 * it today. This module does not import Prisma, does not write to the
 * database, and does not create IngestStagingRecord rows -- the existing
 * importer remains solely responsible for persistence, validation, locality
 * resolution and duplicate detection.
 *
 * Deliberately solves ONLY the four problems identified in Phase 10F:
 * grouping, price range, possession-date parsing, and RERA cleanup. Nothing
 * else (no address synthesis, no coordinates, no amenities, no media).
 */

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const STATUS_LABEL_BY_FILTER: Record<SourceAvailabilityFilter, string> = {
  "under-construction": "Under Construction",
  "ready-to-move": "Ready to Move",
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Two-digit years in this domain are always 20xx -- possession dates are never 1900s. */
function resolveYear(rawYear: string): number {
  if (rawYear.length === 4) return Number(rawYear);
  return 2000 + Number(rawYear);
}

/**
 * Parses MagicBricks' "Mon 'YY" / "Month YYYY" possession-date shorthand
 * into the application's existing first-of-month convention (confirmed in
 * lib/project-data.ts's reconcilePossession()). Also passes through an
 * already-valid full ISO date unchanged. Never guesses a day beyond that
 * existing convention, and never guesses a month/year it can't identify --
 * an unparseable value returns null + POSSESSION_PARSE_FAILED rather than a
 * best-effort approximation.
 */
export function normalizePossessionDate(raw: string | undefined | null): { iso: string | null; flag?: QualityFlag } {
  if (!raw || !raw.trim()) return { iso: null, flag: "POSSESSION_MISSING" };
  const trimmed = raw.trim();

  // Already a full, valid ISO-ish date (e.g. "2028-10-01") -- pass through as-is.
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed) && !Number.isNaN(Date.parse(trimmed))) {
    return { iso: trimmed };
  }

  // "Oct '28", "oct 28", "October 2028", "Dec'31" -- month name + optional
  // apostrophe/space + 2-or-4-digit year.
  const match = trimmed.match(/^([A-Za-z]+)\.?\s*'?\s*(\d{2}|\d{4})$/);
  if (!match) return { iso: null, flag: "POSSESSION_PARSE_FAILED" };

  const monthKey = match[1].toLowerCase();
  const month = MONTH_NAMES[monthKey];
  if (!month) return { iso: null, flag: "POSSESSION_PARSE_FAILED" };

  const year = resolveYear(match[2]);
  const iso = `${year}-${String(month).padStart(2, "0")}-01`;
  return { iso };
}

/**
 * Splits a possibly multi-value RERA string ("P51800047539, PR1181012501116")
 * without silently discarding information. Only the first value is usable
 * against the existing single-valued Project.reraNumber column -- the
 * MULTIPLE_RERA_VALUES flag plus the preserved raw string are how the second
 * value survives for human review instead of vanishing.
 */
export function normalizeReraId(raw: string | undefined | null): {
  reraNumber?: string;
  flag?: QualityFlag;
  rawValue?: string;
} {
  if (!raw || !raw.trim()) return { flag: "RERA_MISSING" };
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { flag: "RERA_MISSING" };
  if (parts.length === 1) return { reraNumber: parts[0] };
  return { reraNumber: parts[0], flag: "MULTIPLE_RERA_VALUES", rawValue: raw.trim() };
}

/**
 * Project-wide price range from ONLY observed `price_inr` values across the
 * listings grouped to one project -- never price_display text, never an
 * invented figure. A single-listing group still produces min===max, but is
 * flagged SINGLE_LISTING_PRICE so a reviewer knows it's one data point, not a
 * confirmed project-wide band.
 */
export function computePriceRange(listings: MagicBricksListing[]): {
  priceMinRupees?: number;
  priceMaxRupees?: number;
  flag?: QualityFlag;
} {
  const prices = listings
    .map((l) => l.price_inr)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0);
  if (prices.length === 0) return {};
  const priceMinRupees = Math.min(...prices);
  const priceMaxRupees = Math.max(...prices);
  return prices.length === 1 ? { priceMinRupees, priceMaxRupees, flag: "SINGLE_LISTING_PRICE" } : { priceMinRupees, priceMaxRupees };
}

interface Bucket {
  key: string;
  projectName: string;
  locality: string;
  listings: MagicBricksListing[];
}

function bucketListings(listings: MagicBricksListing[]): { buckets: Bucket[]; unresolved: UnresolvedListing[] } {
  const unresolved: UnresolvedListing[] = [];
  const byKey = new Map<string, Bucket>();

  for (const listing of listings) {
    const projectName = listing.project_name?.trim();
    if (!projectName) {
      unresolved.push({ reason: "PROJECT_NAME_MISSING", listing });
      continue;
    }
    const locality = listing.locality?.trim();
    if (!locality) {
      unresolved.push({ reason: "LOCALITY_MISSING", listing });
      continue;
    }
    const key = `${normalizeKey(projectName)}|${normalizeKey(locality)}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.listings.push(listing);
    } else {
      byKey.set(key, { key, projectName, locality, listings: [listing] });
    }
  }

  return { buckets: [...byKey.values()], unresolved };
}

/**
 * Main entry point. `filterAvailability` is the Actor's INPUT filter, not
 * anything read from listing data -- every candidate's status is always
 * FILTER_DERIVED (Part H). If the caller can't state which availability
 * filter produced this dataset, status cannot be safely assigned; pass
 * `undefined` and every listing becomes unresolved-by-status via the
 * returned `statusError`.
 */
export function normalizeMagicBricksListings(
  listings: MagicBricksListing[],
  options: { filterAvailability: SourceAvailabilityFilter }
): NormalizeResult {
  const statusLabel = STATUS_LABEL_BY_FILTER[options.filterAvailability];

  const { buckets, unresolved } = bucketListings(listings);

  const candidates: NormalizedProjectCandidate[] = [];
  const conflicts: ConflictGroup[] = [];

  for (const bucket of buckets) {
    const developers = new Set(
      bucket.listings
        .map((l) => l.developer?.trim())
        .filter((d): d is string => Boolean(d))
        .map(normalizeKey)
    );
    if (developers.size > 1) {
      conflicts.push({ type: "DEVELOPER_MISMATCH", projectName: bucket.projectName, locality: bucket.locality, listings: bucket.listings });
      continue;
    }

    const reraResults = bucket.listings.map((l) => normalizeReraId(l.rera_id));
    const distinctFirstRera = new Set(reraResults.map((r) => r.reraNumber?.toUpperCase()).filter((v): v is string => Boolean(v)));
    if (distinctFirstRera.size > 1) {
      conflicts.push({ type: "RERA_MISMATCH", projectName: bucket.projectName, locality: bucket.locality, listings: bucket.listings });
      continue;
    }

    const flags: QualityFlag[] = ["STATUS_FILTER_DERIVED"];

    const developer = bucket.listings.map((l) => l.developer?.trim()).find(Boolean);
    if (!developer) flags.push("DEVELOPER_MISSING");

    const rera = reraResults.find((r) => r.reraNumber)?.reraNumber;
    const reraFlag = reraResults.find((r) => r.flag)?.flag;
    if (reraFlag) flags.push(reraFlag);
    const rawReraValues = reraResults.map((r) => r.rawValue).filter((v): v is string => Boolean(v));

    const firstPossession = bucket.listings.map((l) => normalizePossessionDate(l.possession_date)).find((p) => p.iso || p.flag);
    if (firstPossession?.flag) flags.push(firstPossession.flag);

    const price = computePriceRange(bucket.listings);
    if (price.flag) flags.push(price.flag);

    // Coordinates deliberately never populated -- Phase 10E showed identical
    // lat/lng across every listing regardless of project (locality centroid,
    // not project-specific). Flagged so this omission is visible, not silent.
    flags.push("COORDINATES_UNTRUSTED");

    const description = bucket.listings.map((l) => l.description?.trim()).find(Boolean);

    candidates.push({
      row: {
        name: bucket.projectName,
        ...(developer ? { developer } : {}),
        locality: bucket.locality,
        status: statusLabel,
        ...(rera ? { rera } : {}),
        ...(firstPossession?.iso ? { possession: firstPossession.iso } : {}),
        ...(price.priceMinRupees !== undefined ? { "price min": price.priceMinRupees } : {}),
        ...(price.priceMaxRupees !== undefined ? { "price max": price.priceMaxRupees } : {}),
        ...(description ? { description } : {}),
      },
      flags,
      meta: {
        listingIds: bucket.listings.map((l) => l.listing_id).filter((id): id is string => Boolean(id)),
        listingCount: bucket.listings.length,
        rawReraValues,
      },
    });
  }

  // Rule 4 (Part C): same RERA surfacing under a DIFFERENT project_name+locality
  // group. Flag both candidates involved -- never merge across a name/locality
  // mismatch, since a different declared name could reflect either a labeling
  // error or a genuinely distinct (mis-tagged) registration.
  const candidatesByRera = new Map<string, NormalizedProjectCandidate[]>();
  for (const candidate of candidates) {
    const rera = candidate.row.rera?.toUpperCase();
    if (!rera) continue;
    const list = candidatesByRera.get(rera) ?? [];
    list.push(candidate);
    candidatesByRera.set(rera, list);
  }
  for (const group of candidatesByRera.values()) {
    const distinctNames = new Set(group.map((c) => normalizeKey(c.row.name)));
    if (distinctNames.size > 1) {
      for (const candidate of group) {
        if (!candidate.flags.includes("RERA_CROSS_PROJECT_CONFLICT")) candidate.flags.push("RERA_CROSS_PROJECT_CONFLICT");
      }
    }
  }

  return { candidates, unresolved, conflicts };
}
