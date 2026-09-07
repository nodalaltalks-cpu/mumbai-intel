/**
 * Targeted fix (Payment Plan — one clean founder field) — the pure
 * parse/format/merge logic behind the registry's single "paymentPlans"
 * field and EnrichmentProposalPanel's structured plan-list editor.
 *
 * The staging payload keeps its existing shape: `paymentPlans` remains a
 * plain `string[]` (never a new object shape, never a schema migration —
 * IngestStagingRecord.payload stays a flexible Json column either way), and
 * the legacy singular `paymentPlanType`/`paymentPlanDescription` columns are
 * NEVER deleted or rewritten by anything here — this module only computes
 * what the founder SEES as one consolidated "Payment Plan" field. Each
 * array entry is a self-contained "Type: Description" string (the same
 * convention this field already used before this fix); the functions below
 * are the one place that convention is parsed and re-formatted, so the
 * registry (display) and the proposal panel (structured editing) can never
 * drift apart on how a plan is represented.
 */

export interface PaymentPlanEntry {
  type: string;
  description: string;
}

const SEPARATOR = ": ";

/** Splits on the FIRST "': '" — a plan's type/name is never expected to contain that exact sequence itself. A string with no separator becomes a description-only entry (safer default than guessing it's a bare type). */
export function parsePaymentPlanEntry(raw: string): PaymentPlanEntry {
  const idx = raw.indexOf(SEPARATOR);
  if (idx === -1) return { type: "", description: raw };
  return { type: raw.slice(0, idx), description: raw.slice(idx + SEPARATOR.length) };
}

export function parsePaymentPlanEntries(items: readonly string[] | undefined): PaymentPlanEntry[] {
  return (items ?? []).map(parsePaymentPlanEntry);
}

/** Returns null for an entry with nothing in either half — the caller filters these out rather than persisting an empty plan. */
export function formatPaymentPlanEntry(entry: PaymentPlanEntry): string | null {
  const type = entry.type.trim();
  const description = entry.description.trim();
  if (!type && !description) return null;
  if (type && description) return `${type}${SEPARATOR}${description}`;
  return type || description;
}

export function formatPaymentPlanEntries(entries: readonly PaymentPlanEntry[]): string[] {
  return entries.map(formatPaymentPlanEntry).filter((s): s is string => s !== null);
}

/**
 * The founder-facing "effective" payment plan list for one project: the
 * newer `paymentPlans` array when it has real entries, otherwise the
 * legacy `paymentPlanType`/`paymentPlanDescription` pair folded into ONE
 * synthesized entry (never both shown separately — that's the exact
 * "three competing fields" this fix removes). Returns `[]` when there is
 * genuinely no payment plan data anywhere, never fabricated.
 */
export function mergeLegacyPaymentPlans(paymentPlans: unknown, paymentPlanType: unknown, paymentPlanDescription: unknown): string[] {
  if (Array.isArray(paymentPlans)) {
    const items = paymentPlans.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
    if (items.length > 0) return items;
  }
  const type = typeof paymentPlanType === "string" ? paymentPlanType : "";
  const description = typeof paymentPlanDescription === "string" ? paymentPlanDescription : "";
  const merged = formatPaymentPlanEntry({ type, description });
  return merged ? [merged] : [];
}
