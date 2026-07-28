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

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_\s]+/g, " ");
}

/** Accepts CSV rows (all-string values) or JSON rows (mixed types) — every value is coerced to a trimmed string for uniform downstream parsing, same z.coerce convention already used by every admin form schema in this codebase. */
export function mapRowToProjectFields(row: Record<string, unknown>): Record<string, string> {
  const normalizedRow = new Map<string, string>();
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) continue;
    normalizedRow.set(normalizeHeader(key), String(value).trim());
  }

  const mapped: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(PROJECT_COLUMN_ALIASES)) {
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
