/**
 * Header-alias table for Projects — maps whatever a source file happens to
 * call a column ("Project Name", "project_name", "RERA No"…) onto the exact
 * field names lib/actions/projects.ts's buildProjectData() expects. Adding a
 * new source's header spelling is a one-line addition here, nothing else.
 */
export const PROJECT_COLUMN_ALIASES: Record<string, string[]> = {
  name: ["name", "project name", "project"],
  reraNumber: ["rera number", "rera no", "rera", "rera registration number"],
  address: ["address", "project address", "location", "full address"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "long"],
  status: ["status", "project status", "construction status"],
  category: ["category", "property type", "type"],
  totalUnits: ["total units", "units", "no of units", "number of units"],
  totalTowers: ["total towers", "towers", "no of towers"],
  priceMinRupees: ["price min", "min price", "starting price", "price from"],
  priceMaxRupees: ["price max", "max price", "price to"],
  possessionDate: ["possession date", "possession", "promised possession", "handover date"],
  launchDate: ["launch date", "launch"],
  builderName: ["builder", "builder name", "developer", "developer name"],
  localityName: ["locality", "locality name", "area", "neighbourhood", "neighborhood"],
  description: ["description", "about", "overview"],
  reraStatus: ["rera status"],
};

/**
 * Lowercases and collapses underscores/whitespace into single spaces, same as
 * before, but first splits camelCase word boundaries ("totalUnits" ->
 * "total Units") -- a scraper (e.g. an Apify actor) naturally emits camelCase
 * JSON keys matching this codebase's own field names, which otherwise never
 * matched any alias in these tables (only "total units" or "total_units" did).
 */
function normalizeHeader(header: string): string {
  return header
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, " ");
}

/** Shared by every entity's mapRowToXFields — coerces raw CSV/JSON values to trimmed strings, normalizes header spellings, and resolves the first matching alias per field. */
function mapRow(row: Record<string, unknown>, aliasTable: Record<string, string[]>): Record<string, string> {
  const normalizedRow = new Map<string, string>();
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) continue;
    normalizedRow.set(normalizeHeader(key), String(value).trim());
  }

  const mapped: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(aliasTable)) {
    for (const alias of aliases) {
      const value = normalizedRow.get(normalizeHeader(alias));
      if (value) {
        mapped[field] = value;
        break;
      }
    }
  }
  return mapped;
}

/** Accepts CSV rows (all-string values) or JSON rows (mixed types) — every value is coerced to a trimmed string for uniform downstream parsing, same z.coerce convention already used by every admin form schema in this codebase. */
export function mapRowToProjectFields(row: Record<string, unknown>): Record<string, string> {
  return mapRow(row, PROJECT_COLUMN_ALIASES);
}

/** Header-alias table for Builders — same one-line-per-source-spelling convention as Projects. */
export const BUILDER_COLUMN_ALIASES: Record<string, string[]> = {
  name: ["name", "builder name", "builder", "developer", "developer name"],
  headquarters: ["headquarters", "hq", "head office", "city"],
  foundedYear: ["founded year", "founded", "year founded", "established"],
  websiteUrl: ["website", "website url", "url"],
  reraNumber: ["rera number", "rera no", "rera"],
  description: ["description", "about", "overview"],
  logoUrl: ["logo url", "logo", "logo link"],
};

export function mapRowToBuilderFields(row: Record<string, unknown>): Record<string, string> {
  return mapRow(row, BUILDER_COLUMN_ALIASES);
}

/** Header-alias table for Localities. */
export const LOCALITY_COLUMN_ALIASES: Record<string, string[]> = {
  name: ["name", "locality name", "locality", "area", "neighbourhood", "neighborhood"],
  pincode: ["pincode", "pin code", "zip", "postal code"],
  description: ["description", "about", "overview"],
  centroidLat: ["latitude", "lat", "centroid lat"],
  centroidLng: ["longitude", "lng", "long", "centroid lng"],
  avgPriceRupeesPerSqft: ["avg price per sqft", "average price per sqft", "price per sqft", "avg ppsf"],
  rentalYieldPercent: ["rental yield", "rental yield percent", "rental yield %"],
  connectivityNotes: ["connectivity", "connectivity notes"],
};

export function mapRowToLocalityFields(row: Record<string, unknown>): Record<string, string> {
  return mapRow(row, LOCALITY_COLUMN_ALIASES);
}

/** Header-alias table for Transactions. */
export const TRANSACTION_COLUMN_ALIASES: Record<string, string[]> = {
  localityName: ["locality", "locality name", "area"],
  projectName: ["project", "project name"],
  type: ["type", "transaction type", "deal type"],
  registrationDate: ["registration date", "date", "reg date", "transaction date"],
  valueRupees: ["value", "transaction value", "price", "sale value", "amount"],
  carpetSqft: ["carpet sqft", "carpet area", "area sqft", "sqft"],
  bedrooms: ["bedrooms", "bhk", "configuration"],
  tower: ["tower", "building", "wing"],
  unitLabel: ["unit", "unit label", "flat no", "unit number"],
  // Real external identifier (e.g. an IGR document number) — a strong dedup
  // signal, distinct from the content-hash fallback computeSourceRef() uses
  // when a source doesn't provide one (see transactionFileImportRunner.ts).
  registrationNumber: ["registration number", "document number", "doc number", "regn no", "reg no", "registration no"],
  confidence: ["confidence"],
  sourceNote: ["source note", "note", "notes"],
};

export function mapRowToTransactionFields(row: Record<string, unknown>): Record<string, string> {
  return mapRow(row, TRANSACTION_COLUMN_ALIASES);
}
