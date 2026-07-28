export interface ValidatedBuilderRow {
  name: string;
  headquarters?: string;
  foundedYear?: number;
  websiteUrl?: string;
  reraNumber?: string;
  description?: string;
  logoUrl?: string;
}

export type BuilderValidationResult = { ok: true; data: ValidatedBuilderRow } | { ok: false; error: string };

const CURRENT_YEAR = new Date().getFullYear();

/** Required-field and sanity checks only — mirrors validateProjectRow.ts's discipline of never inventing a value the row didn't provide. */
export function validateBuilderRow(mapped: Record<string, string>): BuilderValidationResult {
  const name = mapped.name?.trim();
  if (!name) return { ok: false, error: "Missing builder name" };

  let foundedYear: number | undefined;
  if (mapped.foundedYear) {
    const year = Number(mapped.foundedYear);
    if (!Number.isInteger(year) || year < 1800 || year > CURRENT_YEAR + 5) {
      return { ok: false, error: `"Founded year" must be a plausible year, got "${mapped.foundedYear}"` };
    }
    foundedYear = year;
  }

  return {
    ok: true,
    data: {
      name,
      headquarters: mapped.headquarters || undefined,
      foundedYear,
      websiteUrl: mapped.websiteUrl || undefined,
      reraNumber: mapped.reraNumber || undefined,
      description: mapped.description || undefined,
      logoUrl: mapped.logoUrl || undefined,
    },
  };
}
