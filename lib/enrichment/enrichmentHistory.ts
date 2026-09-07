import "server-only";
import { getAuditHistory } from "@/lib/admin-queries";

/**
 * Phase 37 -- field-level history for Project enrichment accept/edit/undo,
 * built entirely on the EXISTING AuditLog model + logAudit()/getAuditHistory()
 * (see lib/audit.ts, lib/admin-queries.ts's getAuditHistory, and the Project
 * edit page's existing AuditHistory.tsx panel) -- no new table, no new
 * column, no second audit system. AuditLog has no dedicated "fieldKey"
 * column (a single staging record's payload has many enrichable fields), so
 * every event this module writes is scoped by
 * `entityType="ProjectEnrichmentField", entityId=stagingRecordId`, with the
 * specific field key carried inside the existing `before`/`after` Json
 * columns; getEnrichmentFieldHistory() filters to one field in-memory after
 * the single indexed [entityType, entityId] lookup (a staging record only
 * ever accumulates a small, human-scale number of these events, so this
 * costs nothing).
 */

export const ENRICHMENT_HISTORY_ENTITY_TYPE = "ProjectEnrichmentField";

export type EnrichmentHistoryActionType = "ACCEPT" | "EDIT_ACCEPT" | "REVERT" | "RE_ACCEPT" | "REJECT";

const ACTION_TYPE_TO_STORED: Record<EnrichmentHistoryActionType, string> = {
  ACCEPT: "enrichment.accept",
  EDIT_ACCEPT: "enrichment.edit_accept",
  REVERT: "enrichment.revert",
  RE_ACCEPT: "enrichment.re_accept",
  REJECT: "enrichment.reject",
};

const STORED_TO_ACTION_TYPE: Record<string, EnrichmentHistoryActionType> = Object.fromEntries(
  (Object.entries(ACTION_TYPE_TO_STORED) as [EnrichmentHistoryActionType, string][]).map(([type, stored]) => [stored, type])
);

export function actionTypeToStoredAction(actionType: EnrichmentHistoryActionType): string {
  return ACTION_TYPE_TO_STORED[actionType];
}

/**
 * What one history event's `before`/`after` Json column actually holds.
 * `displayValue`/`displayItems` are the human-readable strings the founder
 * actually saw (what EnrichmentField.proposedValue/proposedItems or the
 * staged current value looked like) -- shown in the History dialog.
 * `payloadChanges` is the exact raw IngestStagingRecord.payload key(s) and
 * value(s) at this point (a number, a real string[], an enum key, an ISO
 * date string, or null) -- used ONLY to restore an exact prior value on
 * Undo, never re-parsed from the display string, so restoration is always
 * byte-exact regardless of field type. `sourceUrl`/`sourceType`/`confidence`
 * are only ever present on a real accept from an official source -- a
 * Revert never invents provenance for the value it restores. `reason`
 * (targeted fix, founder-testing round) is set ONLY on a REJECT event's
 * `after` snapshot -- the founder's required explanation for declining a
 * proposed value; every other action type leaves it undefined.
 */
export interface EnrichmentHistorySnapshot {
  fieldKey: string;
  displayValue: string | null;
  displayItems?: string[];
  payloadChanges: Record<string, unknown>;
  sourceUrl?: string | null;
  sourceType?: string | null;
  confidence?: string | null;
  reason?: string;
}

export interface EnrichmentHistoryEntry {
  id: string;
  action: EnrichmentHistoryActionType;
  at: string;
  actorName: string | null;
  before: EnrichmentHistorySnapshot | null;
  after: EnrichmentHistorySnapshot | null;
}

function isSnapshot(value: unknown): value is EnrichmentHistorySnapshot {
  return Boolean(value) && typeof value === "object" && typeof (value as Record<string, unknown>).fieldKey === "string";
}

/**
 * Compares two plain payload objects and returns exactly the keys whose
 * value differs. This is the ONE mechanism both history-writing (Accept)
 * and history-reading (Undo's restoration) rely on for exact values --
 * comparing real JS values (numbers, arrays, null), never re-parsing a
 * formatted display string.
 */
export function computePayloadDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): { key: string; before: unknown; after: unknown }[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diffs: { key: string; before: unknown; after: unknown }[] = [];
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diffs.push({ key, before: before[key], after: after[key] });
    }
  }
  return diffs;
}

/**
 * A payload key that was genuinely ABSENT (the field was blank -- this
 * codebase's own convention throughout Phase 32/33/36 is "the key doesn't
 * exist on the payload object", never a stored `null`) can't be represented
 * as plain `undefined` inside `payloadChanges`: `undefined` values are
 * silently dropped by JSON.stringify, so they'd never survive being written
 * to AuditLog's Json column, and a restore step could never tell "this key
 * should become absent" apart from "this key was never part of the diff at
 * all". This marker exists ONLY to make that distinction round-trip through
 * JSON storage exactly -- see toStorableChanges/applyStorableChanges below,
 * the only two places that ever read or write it.
 */
const UNSET_MARKER = "__ENRICHMENT_HISTORY_UNSET__";

/** Converts a set of {key, value} raw payload changes into the JSON-safe shape stored in AuditLog.before/after.payloadChanges -- `undefined` becomes the explicit UNSET_MARKER so "this key should be absent" survives JSON storage. */
export function toStorableChanges(entries: { key: string; value: unknown }[]): Record<string, unknown> {
  return Object.fromEntries(entries.map(({ key, value }) => [key, value === undefined ? UNSET_MARKER : value]));
}

/** Applies a stored `payloadChanges` map onto a real staging payload -- a key holding UNSET_MARKER is DELETED (restoring "genuinely blank"), never merely left unset via spread (which would silently keep whatever the target object already had for that key). Every other key is assigned its exact stored value (a real string, number, array, or null). */
export function applyStorableChanges(target: Record<string, unknown>, changes: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const [key, value] of Object.entries(changes)) {
    if (value === UNSET_MARKER) delete result[key];
    else result[key] = value;
  }
  return result;
}

/** All enrichment-history events for one staging record's ONE field, newest first. */
export async function getEnrichmentFieldHistory(stagingRecordId: string, fieldKey: string): Promise<EnrichmentHistoryEntry[]> {
  const rows = await getAuditHistory(ENRICHMENT_HISTORY_ENTITY_TYPE, stagingRecordId, 200);
  return rows
    .filter((row) => {
      const before = row.before as unknown;
      const after = row.after as unknown;
      return (isSnapshot(before) && before.fieldKey === fieldKey) || (isSnapshot(after) && after.fieldKey === fieldKey);
    })
    .map((row) => ({
      id: row.id,
      action: STORED_TO_ACTION_TYPE[row.action] ?? "ACCEPT",
      at: row.at.toISOString(),
      actorName: row.actor?.name ?? row.actor?.email ?? null,
      before: isSnapshot(row.before) ? row.before : null,
      after: isSnapshot(row.after) ? row.after : null,
    }));
}

/** The single most recent enrichment-history event for one field, or null if it's never been accepted/reverted before. Drives both the ACCEPT/EDIT_ACCEPT/RE_ACCEPT decision and Undo's concurrency check. */
export async function getMostRecentEnrichmentHistoryEvent(stagingRecordId: string, fieldKey: string): Promise<EnrichmentHistoryEntry | null> {
  const history = await getEnrichmentFieldHistory(stagingRecordId, fieldKey);
  return history[0] ?? null;
}

/**
 * Targeted fix (repeated rejected proposal bug) -- the most recent history
 * event for EVERY field on this staging record, in ONE query (the same
 * underlying getAuditHistory call getEnrichmentFieldHistory already uses per
 * field, just grouped once instead of once-per-field). A fresh Enrich run
 * uses this to tell "the source is proposing the EXACT SAME thing the
 * founder already explicitly reviewed and declined" apart from "the
 * proposal materially changed and deserves a fresh look" -- see
 * classifyEnrichment.ts's suppressPreviouslyRejectedProposals, the only
 * caller. Rows are already newest-first (getAuditHistory's own orderBy), so
 * the first event seen for a given field key is authoritative.
 */
export async function getMostRecentEnrichmentEventsByField(
  stagingRecordId: string
): Promise<Map<string, { action: EnrichmentHistoryActionType; after: EnrichmentHistorySnapshot | null }>> {
  const rows = await getAuditHistory(ENRICHMENT_HISTORY_ENTITY_TYPE, stagingRecordId, 200);
  const result = new Map<string, { action: EnrichmentHistoryActionType; after: EnrichmentHistorySnapshot | null }>();
  for (const row of rows) {
    const before = row.before as unknown;
    const after = row.after as unknown;
    const fieldKey = isSnapshot(after) ? after.fieldKey : isSnapshot(before) ? before.fieldKey : null;
    if (!fieldKey || result.has(fieldKey)) continue;
    result.set(fieldKey, { action: STORED_TO_ACTION_TYPE[row.action] ?? "ACCEPT", after: isSnapshot(after) ? after : null });
  }
  return result;
}

/**
 * ACCEPT the first time a field is ever accepted; RE_ACCEPT immediately
 * after an Undo (the founder is putting an enrichment value back in place
 * after having reverted it); EDIT_ACCEPT for every other re-accept (a plain
 * edit-then-accept, or accepting again after a fresh re-enrichment, with no
 * revert in between).
 */
export function determineAcceptActionType(mostRecent: EnrichmentHistoryEntry | null): EnrichmentHistoryActionType {
  if (!mostRecent) return "ACCEPT";
  if (mostRecent.action === "REVERT") return "RE_ACCEPT";
  return "EDIT_ACCEPT";
}
