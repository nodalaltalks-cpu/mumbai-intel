import { CATEGORY_LABEL, PROJECT_STATUSES, PROPERTY_CATEGORIES, STATUS_LABEL, type ProjectStatus, type PropertyCategory } from "@/lib/project-meta";

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s-]+/g, " ");
}

const STATUS_LOOKUP = new Map<string, ProjectStatus>();
for (const status of PROJECT_STATUSES) {
  STATUS_LOOKUP.set(normalizeLabel(status), status);
  STATUS_LOOKUP.set(normalizeLabel(STATUS_LABEL[status]), status);
}
// Common real-world synonyms seen in builder/RERA exports, beyond the exact enum labels.
STATUS_LOOKUP.set("ready", "READY_TO_MOVE");
STATUS_LOOKUP.set("completed", "DELIVERED");
STATUS_LOOKUP.set("complete", "DELIVERED");
STATUS_LOOKUP.set("new launch", "PRE_LAUNCH");
STATUS_LOOKUP.set("ongoing", "UNDER_CONSTRUCTION");

const CATEGORY_LOOKUP = new Map<string, PropertyCategory>();
for (const category of PROPERTY_CATEGORIES) {
  CATEGORY_LOOKUP.set(normalizeLabel(category), category);
  CATEGORY_LOOKUP.set(normalizeLabel(CATEGORY_LABEL[category]), category);
}

export interface ValidatedProjectRow {
  name: string;
  reraNumber?: string;
  address?: string;
  status: ProjectStatus;
  category: PropertyCategory;
  totalUnits?: number;
  totalTowers?: number;
  priceMinRupees?: number;
  possessionDate?: Date;
  launchDate?: Date;
  builderName?: string;
  localityName: string;
  description?: string;
}

export type ValidationResult = { ok: true; data: ValidatedProjectRow } | { ok: false; error: string };

function parsePositiveNumber(raw: string | undefined, label: string): { ok: true; value?: number } | { ok: false; error: string } {
  if (!raw) return { ok: true, value: undefined };
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0) return { ok: false, error: `"${label}" must be a positive number, got "${raw}"` };
  return { ok: true, value: n };
}

function parseDate(raw: string | undefined, label: string): { ok: true; value?: Date } | { ok: false; error: string } {
  if (!raw) return { ok: true, value: undefined };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { ok: false, error: `"${label}" is not a valid date, got "${raw}"` };
  return { ok: true, value: d };
}

/** Required-field and sanity checks only — never invents a value the row didn't provide (category falls back to the schema's own RESIDENTIAL default, not a guess). */
export function validateProjectRow(mapped: Record<string, string>): ValidationResult {
  const name = mapped.name?.trim();
  if (!name) return { ok: false, error: "Missing project name" };

  const localityName = mapped.localityName?.trim();
  if (!localityName) return { ok: false, error: "Missing locality" };

  const rawStatus = mapped.status ? normalizeLabel(mapped.status) : "";
  const status = STATUS_LOOKUP.get(rawStatus);
  if (!status) return { ok: false, error: `Unrecognized or missing status "${mapped.status ?? ""}"` };

  const rawCategory = mapped.category ? normalizeLabel(mapped.category) : "";
  const category = (rawCategory && CATEGORY_LOOKUP.get(rawCategory)) || "RESIDENTIAL";

  const totalUnits = parsePositiveNumber(mapped.totalUnits, "Total units");
  if (!totalUnits.ok) return totalUnits;
  const totalTowers = parsePositiveNumber(mapped.totalTowers, "Total towers");
  if (!totalTowers.ok) return totalTowers;
  const priceMinRupees = parsePositiveNumber(mapped.priceMinRupees, "Price min");
  if (!priceMinRupees.ok) return priceMinRupees;

  const possessionDate = parseDate(mapped.possessionDate, "Possession date");
  if (!possessionDate.ok) return possessionDate;
  const launchDate = parseDate(mapped.launchDate, "Launch date");
  if (!launchDate.ok) return launchDate;

  return {
    ok: true,
    data: {
      name,
      reraNumber: mapped.reraNumber || undefined,
      address: mapped.address || undefined,
      status,
      category,
      totalUnits: totalUnits.value,
      totalTowers: totalTowers.value,
      priceMinRupees: priceMinRupees.value,
      possessionDate: possessionDate.value,
      launchDate: launchDate.value,
      builderName: mapped.builderName || undefined,
      localityName,
      description: mapped.description || undefined,
    },
  };
}
