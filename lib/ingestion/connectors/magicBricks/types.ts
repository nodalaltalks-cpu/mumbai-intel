/**
 * Raw shape of one record from the Thirdwatch "MagicBricks India Scraper"
 * Apify actor ("All fields" output, as observed in the Phase 10E test run) --
 * one listing/unit, not one project. Every field is optional except the ones
 * the normalizer treats as load-bearing for grouping (project_name, locality),
 * which are still typed optional here since real-world rows can omit them.
 */
export interface MagicBricksListing {
  listing_id?: string;
  title?: string;
  project_name?: string;
  developer?: string;
  locality?: string;
  city?: string;
  rera_id?: string;
  possession_date?: string;
  price_inr?: number;
  price_display?: string;
  price_per_sqft?: number;
  carpet_area_sqft?: number;
  bhk?: number;
  bedrooms?: number;
  bathrooms?: number;
  propertyType?: string;
  propertyType_display?: string;
  furnishing?: string;
  latitude?: number;
  longitude?: number;
  images?: string[];
  description?: string;
  url?: string;
  posted_at?: string;
  [key: string]: unknown;
}

/**
 * Non-destructive quality metadata the normalizer attaches to its output.
 * Never persisted to the database -- for admin-review/log/test consumption
 * only, exactly as Phase 11 Part I requires.
 */
export const QUALITY_FLAGS = [
  "SINGLE_LISTING_PRICE",
  "MULTIPLE_RERA_VALUES",
  "RERA_MISSING",
  "POSSESSION_MISSING",
  "POSSESSION_PARSE_FAILED",
  "PROJECT_NAME_MISSING",
  "LOCALITY_MISSING",
  "DEVELOPER_MISSING",
  "STATUS_FILTER_DERIVED",
  "COORDINATES_UNTRUSTED",
  /** Rule 4 (Part C): same RERA observed under a different project_name+locality group -- flagged, never merged. */
  "RERA_CROSS_PROJECT_CONFLICT",
] as const;
export type QualityFlag = (typeof QUALITY_FLAGS)[number];

/**
 * One project candidate's row data, using ONLY field-name spellings already
 * present in PROJECT_COLUMN_ALIASES (lib/ingestion/connectors/fileImport/columnMapping.ts)
 * -- verified single-word or space-separated aliases that survive
 * normalizeHeader() unchanged, so this object can be JSON.stringify'd and
 * handed to the EXISTING runProjectFileImport() exactly like any manual
 * CSV/JSON upload, with zero importer changes. See the Phase 11 report for
 * why each key was chosen.
 */
export interface NormalizedProjectRow {
  name: string;
  developer?: string;
  locality: string;
  status: string;
  rera?: string;
  possession?: string;
  "price min"?: number;
  "price max"?: number;
  description?: string;
}

export interface NormalizedProjectCandidate {
  row: NormalizedProjectRow;
  flags: QualityFlag[];
  /** Traceability only -- never sent to the existing importer, not part of `row`. */
  meta: {
    listingIds: string[];
    listingCount: number;
    rawReraValues: string[];
  };
}

export type UnresolvedReason = "PROJECT_NAME_MISSING" | "LOCALITY_MISSING";

export interface UnresolvedListing {
  reason: UnresolvedReason;
  listing: MagicBricksListing;
}

export type ConflictType = "DEVELOPER_MISMATCH" | "RERA_MISMATCH";

export interface ConflictGroup {
  type: ConflictType;
  projectName: string;
  locality: string;
  listings: MagicBricksListing[];
}

export interface NormalizeResult {
  candidates: NormalizedProjectCandidate[];
  unresolved: UnresolvedListing[];
  conflicts: ConflictGroup[];
}

/** The only two statuses this normalizer can safely assign -- always FILTER_DERIVED, never read from listing data (Part H). */
export type SourceAvailabilityFilter = "under-construction" | "ready-to-move";
