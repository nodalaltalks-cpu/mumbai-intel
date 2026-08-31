"use server";

import { requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { classifyProjectEnrichment } from "@/lib/enrichment/classifyEnrichment";
import { resolveDeveloperDomain } from "@/lib/enrichment/developerDomainRegistry";
import { applyAcceptedField } from "@/lib/enrichment/applyAcceptedField";
import { buildEntityMatchProposal, resolveBuilderMatch, resolveLocalityMatch, type EntityMatchProposal } from "@/lib/enrichment/resolveNamedEntity";
import {
  actionTypeToStoredAction,
  applyStorableChanges,
  computePayloadDiff,
  determineAcceptActionType,
  ENRICHMENT_HISTORY_ENTITY_TYPE,
  getEnrichmentFieldHistory,
  getMostRecentEnrichmentHistoryEvent,
  toStorableChanges,
  type EnrichmentHistoryEntry,
  type EnrichmentHistorySnapshot,
} from "@/lib/enrichment/enrichmentHistory";
import { godrejPropertiesAdapter, GODREJ_SKY_SHORE_PROJECT_URL } from "@/lib/enrichment/adapters/godrejPropertiesAdapter";
import { adaniRealtyAdapter, ADANI_LINKBAY_RESIDENCES_PROJECT_URL } from "@/lib/enrichment/adapters/adaniRealtyAdapter";
import type { EnrichmentField, OfficialSourceAdapter } from "@/lib/enrichment/types";
import { buildProjectReviewCompleteness } from "@/lib/ingestion/reviewFieldRegistry";
import type { ProjectImportPayload } from "@/lib/ingestion/connectors/fileImport/types";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import { logAudit } from "@/lib/audit";
import { friendlyPrismaError } from "./errors";
import type { Prisma } from "@prisma/client";

export type EnrichProjectStatus = "SUCCESS" | "NO_SOURCE" | "SOURCE_UNAVAILABLE" | "NO_NEW_INFO" | "ERROR";

export interface EnrichProjectResult {
  status: EnrichProjectStatus;
  fields?: EnrichmentField[];
  /** Phase 33 -- only present when the source produced a developerGroup/locality name to try resolving against the existing Builder/Locality tables. Never creates a row; see resolveNamedEntity.ts. */
  builderMatch?: EntityMatchProposal;
  localityMatch?: EntityMatchProposal;
  error?: string;
}

/**
 * The curated developer-domain -> {project page, adapter} mapping this MVP
 * knows (Phase 29 Part G, extended to a second developer in Phase 31).
 * Resolving a developer's official DOMAIN (via the curated registry) and
 * knowing the specific PROJECT PAGE + which adapter understands that site's
 * markup are separate problems -- this MVP solves both by hand, for exactly
 * the known staged projects, rather than guessing a URL pattern or assuming
 * one adapter's shape works for every developer. Adding a third
 * project/developer means adding one verified row here, the same discipline
 * developerDomainRegistry.ts already uses for domains.
 */
const CURATED_SOURCES: Record<string, { projectUrl: string; adapter: OfficialSourceAdapter }> = {
  "https://www.godrejproperties.com": { projectUrl: GODREJ_SKY_SHORE_PROJECT_URL, adapter: godrejPropertiesAdapter },
  "https://www.adanirealty.com": { projectUrl: ADANI_LINKBAY_RESIDENCES_PROJECT_URL, adapter: adaniRealtyAdapter },
};

/**
 * Runs a real, on-demand enrichment pass for ONE Project staging record
 * against its official developer source (Phase 29 Part G/H/J).
 *
 * Explicitly does NOT:
 *  - write anything to Project, IngestStagingRecord, or any other table
 *  - approve, reject, or otherwise change the staging record's status
 *  - cache or persist its result anywhere -- every call re-fetches live
 *
 * One click = one attempt. The caller (ReviewQueueList.tsx) must only invoke
 * this from an explicit button click, never from a page-load effect.
 */
export async function enrichProjectAction(stagingRecordId: string): Promise<EnrichProjectResult> {
  await requireMutateSession();

  const record = await prisma.ingestStagingRecord.findUnique({ where: { id: stagingRecordId } });
  if (!record) {
    return { status: "ERROR", error: "Staging record not found." };
  }
  if (record.entityType !== "Project") {
    return { status: "ERROR", error: "Enrichment is only available for Project staging records." };
  }

  const payload = record.payload as unknown as ProjectImportPayload;

  const domain = resolveDeveloperDomain(payload.developerGroup);
  const source = domain ? CURATED_SOURCES[domain] : undefined;
  if (!domain || !source) {
    return { status: "NO_SOURCE" };
  }

  const [locality, builder] = await Promise.all([
    payload.localityId ? prisma.locality.findUnique({ where: { id: payload.localityId }, select: { name: true } }) : Promise.resolve(null),
    payload.builderId ? prisma.builder.findUnique({ where: { id: payload.builderId }, select: { name: true } }) : Promise.resolve(null),
  ]);

  let facts;
  try {
    facts = await source.adapter.fetchProjectFacts(source.projectUrl);
  } catch {
    return { status: "SOURCE_UNAVAILABLE" };
  }

  const fields = classifyProjectEnrichment(
    payload,
    { localityName: locality?.name, builderName: builder?.name },
    facts,
    { url: source.projectUrl, tier: source.adapter.tier }
  );

  const { builderMatch, localityMatch } = await resolveBuilderAndLocalityMatches(fields, payload);

  const hasNewInfo =
    fields.some((f) => f.classification === "GREEN_NEW" || f.classification === "YELLOW" || f.classification === "CONFLICT") ||
    (builderMatch && builderMatch.classification !== "MISSING" && builderMatch.classification !== "CONFIRMED") ||
    (localityMatch && localityMatch.classification !== "MISSING" && localityMatch.classification !== "CONFIRMED");
  if (!hasNewInfo) {
    return { status: "NO_NEW_INFO", fields, builderMatch, localityMatch };
  }

  return { status: "SUCCESS", fields, builderMatch, localityMatch };
}

/**
 * Phase 33 -- when the source produced a `developerGroup` and/or `locality`
 * fact, tries to resolve that NAME against the existing Builder/Locality
 * tables (never creates a row). Only queries the DB when there's actually a
 * proposed name to resolve, so a source that never mentions either (e.g.
 * Adani's page has no discrete locality field, per Phase 31) costs nothing
 * extra.
 */
async function resolveBuilderAndLocalityMatches(
  fields: EnrichmentField[],
  payload: ProjectImportPayload
): Promise<{ builderMatch?: EntityMatchProposal; localityMatch?: EntityMatchProposal }> {
  const developerGroupField = fields.find((f) => f.key === "developerGroup");
  const localityField = fields.find((f) => f.key === "locality");

  const [builderMatch, localityMatch] = await Promise.all([
    developerGroupField?.proposedValue
      ? (async () => {
          const builders = await prisma.builder.findMany({ select: { id: true, name: true, legalNames: true, reraNumber: true } });
          const currentBuilder = payload.builderId ? (builders.find((b) => b.id === payload.builderId) ?? null) : null;
          const match = resolveBuilderMatch(builders, developerGroupField.proposedValue!);
          return buildEntityMatchProposal(
            "builder",
            "Builder",
            developerGroupField.proposedValue!,
            payload.builderId ?? null,
            currentBuilder?.name ?? null,
            match
          );
        })()
      : Promise.resolve(undefined),
    localityField?.proposedValue
      ? (async () => {
          const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG }, select: { id: true } });
          const localities = city
            ? await prisma.locality.findMany({
                where: { cityId: city.id },
                select: { id: true, name: true, aliases: { select: { alias: true } } },
              })
            : [];
          const flattened = localities.map((l) => ({ id: l.id, name: l.name, aliases: l.aliases.map((a) => a.alias) }));
          const currentLocality = payload.localityId ? (localities.find((l) => l.id === payload.localityId) ?? null) : null;
          const match = resolveLocalityMatch(flattened, localityField.proposedValue!);
          return buildEntityMatchProposal(
            "locality",
            "Locality",
            localityField.proposedValue!,
            payload.localityId ?? null,
            currentLocality?.name ?? null,
            match
          );
        })()
      : Promise.resolve(undefined),
  ]);

  return { builderMatch, localityMatch };
}

export type AcceptEnrichmentFieldStatus = "SUCCESS" | "NOT_FOUND" | "NOT_PENDING" | "INVALID_FIELD" | "INVALID_VALUE" | "ERROR";

export interface AcceptEnrichmentFieldResult {
  status: AcceptEnrichmentFieldStatus;
  error?: string;
}

export interface AcceptEnrichmentFieldContext {
  /** What the founder saw as "Current" before this accept -- only used when this is the field's very first acceptance (no prior history exists yet to read it from instead). */
  currentDisplayValue?: string | null;
  sourceUrl?: string | null;
  sourceType?: string | null;
  confidence?: string | null;
}

/**
 * Persists ONE accepted enrichment field into the existing PENDING staging
 * record's payload (Phase 32 Part E) -- never writes to Project, Transaction,
 * Builder, or Locality, and never touches the staging record's own status.
 * The existing Approve/Reject workflow (approveStagingRecordAction) is the
 * only thing that ever moves data into the live catalog; this action only
 * makes the PENDING record itself more complete before that step.
 *
 * Reuses the existing 44-field registry (buildProjectReviewCompleteness) to
 * validate `fieldKey` is a real Project field, and the existing
 * IngestStagingRecord.payload Json column as the persistence target -- no
 * new table, model, or column. `proposedItems`, when given, is the real
 * underlying list behind a count-displayed field (e.g. actual amenity names,
 * not just "14 selected") -- see lib/enrichment/types.ts's RawSourceFact.items.
 *
 * Phase 37: also records a field-level history event on the EXISTING
 * AuditLog model (logAudit -- the same mechanism the Project edit page's own
 * History panel already reads), scoped as
 * entityType="ProjectEnrichmentField", entityId=stagingRecordId. The action
 * type (ACCEPT / EDIT_ACCEPT / RE_ACCEPT) is derived from this field's own
 * most recent history event, not trusted from the client. A logging failure
 * never fails the accept itself -- logAudit already swallows its own errors
 * (see lib/audit.ts), matching every other call site in this codebase.
 *
 * Same auth bar as enrichProjectAction (Part K) -- accepting a field is a
 * staging-only write, not the higher-stakes catalog write approval requires.
 */
export async function acceptEnrichmentFieldAction(
  stagingRecordId: string,
  fieldKey: string,
  proposedValue: string,
  proposedItems?: string[],
  context?: AcceptEnrichmentFieldContext
): Promise<AcceptEnrichmentFieldResult> {
  const session = await requireMutateSession();

  const record = await prisma.ingestStagingRecord.findUnique({ where: { id: stagingRecordId } });
  if (!record) {
    return { status: "NOT_FOUND", error: "Staging record not found." };
  }
  if (record.entityType !== "Project") {
    return { status: "ERROR", error: "Enrichment acceptance is only available for Project staging records." };
  }
  if (record.status !== "PENDING") {
    return { status: "NOT_PENDING", error: "This record is no longer pending review -- it has already been approved or rejected." };
  }

  const payload = record.payload as unknown as Record<string, unknown>;

  const completeness = buildProjectReviewCompleteness(payload as unknown as ProjectImportPayload, {});
  const validKeys = new Set(completeness.groups.flatMap((g) => g.fields.map((f) => f.key)));
  if (!validKeys.has(fieldKey)) {
    return { status: "INVALID_FIELD", error: `"${fieldKey}" is not a recognized Project field.` };
  }

  const applied = applyAcceptedField(payload, fieldKey, proposedValue, proposedItems);
  if (!applied.ok) {
    return { status: "INVALID_VALUE", error: applied.error };
  }

  try {
    await prisma.ingestStagingRecord.update({
      where: { id: stagingRecordId },
      data: { payload: applied.payload as unknown as Prisma.InputJsonValue },
    });
  } catch (error) {
    return { status: "ERROR", error: friendlyPrismaError(error) };
  }

  const mostRecent = await getMostRecentEnrichmentHistoryEvent(stagingRecordId, fieldKey);
  const actionType = determineAcceptActionType(mostRecent);
  const diffs = computePayloadDiff(payload, applied.payload);

  const before: EnrichmentHistorySnapshot = mostRecent?.after
    ? mostRecent.after
    : {
        fieldKey,
        displayValue: context?.currentDisplayValue ?? null,
        payloadChanges: toStorableChanges(diffs.map((d) => ({ key: d.key, value: d.before }))),
      };
  const after: EnrichmentHistorySnapshot = {
    fieldKey,
    displayValue: proposedValue,
    displayItems: proposedItems,
    payloadChanges: toStorableChanges(diffs.map((d) => ({ key: d.key, value: d.after }))),
    sourceUrl: context?.sourceUrl ?? null,
    sourceType: context?.sourceType ?? null,
    confidence: context?.confidence ?? null,
  };

  await logAudit(session.userId, actionTypeToStoredAction(actionType), ENRICHMENT_HISTORY_ENTITY_TYPE, stagingRecordId, { before, after });

  return { status: "SUCCESS" };
}

export type AcceptEntityMatchStatus = "SUCCESS" | "NOT_FOUND" | "NOT_PENDING" | "INVALID_ENTITY" | "ERROR";

export interface AcceptEntityMatchResult {
  status: AcceptEntityMatchStatus;
  error?: string;
}

/**
 * Persists a founder-selected EXISTING Builder/Locality id into the existing
 * PENDING staging record's payload (Phase 33 Part F/G) -- never creates a
 * Builder or Locality row, never writes to Project, and never touches the
 * staging record's own status. `existingId` is re-verified against the real
 * table on every call (Part L "invalid entity ID rejected") rather than
 * trusted from the client, since a stale/tampered id must never silently
 * land in the staging payload.
 *
 * Same auth bar as acceptEnrichmentFieldAction (Part L) -- this is a
 * staging-only write, not the higher-stakes catalog write approval requires.
 */
export async function acceptEntityMatchAction(
  stagingRecordId: string,
  entityKind: "builder" | "locality",
  existingId: string
): Promise<AcceptEntityMatchResult> {
  await requireMutateSession();

  const record = await prisma.ingestStagingRecord.findUnique({ where: { id: stagingRecordId } });
  if (!record) {
    return { status: "NOT_FOUND", error: "Staging record not found." };
  }
  if (record.entityType !== "Project") {
    return { status: "ERROR", error: "Builder/Locality resolution is only available for Project staging records." };
  }
  if (record.status !== "PENDING") {
    return { status: "NOT_PENDING", error: "This record is no longer pending review -- it has already been approved or rejected." };
  }

  const exists =
    entityKind === "builder"
      ? await prisma.builder.findUnique({ where: { id: existingId }, select: { id: true } })
      : await prisma.locality.findUnique({ where: { id: existingId }, select: { id: true } });
  if (!exists) {
    return { status: "INVALID_ENTITY", error: `This ${entityKind} no longer exists.` };
  }

  const payload = record.payload as unknown as Record<string, unknown>;
  const payloadKey = entityKind === "builder" ? "builderId" : "localityId";
  const updatedPayload = { ...payload, [payloadKey]: existingId };

  try {
    await prisma.ingestStagingRecord.update({
      where: { id: stagingRecordId },
      data: { payload: updatedPayload as unknown as Prisma.InputJsonValue },
    });
  } catch (error) {
    return { status: "ERROR", error: friendlyPrismaError(error) };
  }

  return { status: "SUCCESS" };
}

/**
 * Read-only: every history event recorded for one Project staging record's
 * one enrichment field, newest first -- powers the "View History" dialog.
 * Same auth bar as every other action here (Part H); this is admin-only page
 * content, not a public read.
 */
export async function getEnrichmentFieldHistoryAction(stagingRecordId: string, fieldKey: string): Promise<EnrichmentHistoryEntry[]> {
  await requireMutateSession();
  return getEnrichmentFieldHistory(stagingRecordId, fieldKey);
}

export type RevertEnrichmentFieldStatus = "SUCCESS" | "NOT_FOUND" | "NOT_PENDING" | "NOTHING_TO_UNDO" | "CONFLICT" | "ERROR";

export interface RevertEnrichmentFieldResult {
  status: RevertEnrichmentFieldStatus;
  error?: string;
}

/**
 * Undoes the most recent accepted enrichment value for one field, restoring
 * the EXACT prior raw payload value(s) (Part E -- never a blind null/blank,
 * never a re-parsed display string) -- reuses the same
 * IngestStagingRecord.payload persistence path acceptEnrichmentFieldAction
 * already writes through; no second persistence mechanism.
 *
 * Concurrency (Part G): re-reads the staging record fresh, then requires
 * `historyEventId` to still be this field's single most recent history
 * event. If someone else (or another browser tab) has accepted/edited/
 * undone this same field since the caller last loaded it, `historyEventId`
 * will no longer be the latest one -- this returns CONFLICT and changes
 * nothing, rather than trusting a stale client-side value.
 *
 * Records its own REVERT history event afterward -- prior events are never
 * updated or deleted (Part "HISTORY MUST BE IMMUTABLE"). A revert never
 * invents source/confidence provenance for the restored value (Part
 * "SOURCE" -- "do not invent provenance for old values").
 */
export async function revertEnrichmentFieldAction(
  stagingRecordId: string,
  fieldKey: string,
  historyEventId: string
): Promise<RevertEnrichmentFieldResult> {
  const session = await requireMutateSession();

  const record = await prisma.ingestStagingRecord.findUnique({ where: { id: stagingRecordId } });
  if (!record) {
    return { status: "NOT_FOUND", error: "Staging record not found." };
  }
  if (record.entityType !== "Project") {
    return { status: "ERROR", error: "Enrichment history is only available for Project staging records." };
  }
  if (record.status !== "PENDING") {
    return {
      status: "NOT_PENDING",
      error: "This record is no longer pending review -- undoing an enrichment value is only possible before approval.",
    };
  }

  const mostRecent = await getMostRecentEnrichmentHistoryEvent(stagingRecordId, fieldKey);
  if (!mostRecent) {
    return { status: "NOTHING_TO_UNDO", error: "This field has no accepted enrichment value to undo." };
  }
  if (mostRecent.id !== historyEventId) {
    return {
      status: "CONFLICT",
      error: "This field has changed since you last viewed it. Please review the current value and history before undoing.",
    };
  }
  if (mostRecent.action === "REVERT") {
    return { status: "NOTHING_TO_UNDO", error: "This field is already at its original value -- there's nothing further to undo." };
  }
  if (!mostRecent.before) {
    return { status: "ERROR", error: "This history event has no recorded prior value to restore." };
  }

  const payload = record.payload as unknown as Record<string, unknown>;
  const restoreChanges = mostRecent.before.payloadChanges;
  // applyStorableChanges DELETES a key whose stored value is the UNSET
  // marker (a genuinely blank field before the enrichment change), rather
  // than merely omitting it from a spread -- a plain `{...payload,
  // ...restoreChanges}` would silently leave the CURRENT accepted value in
  // place for exactly that case, which is the one Part "UNDO BEHAVIOR"
  // explicitly calls out as never acceptable.
  const restoredPayload = applyStorableChanges(payload, restoreChanges);

  try {
    await prisma.ingestStagingRecord.update({
      where: { id: stagingRecordId },
      data: { payload: restoredPayload as unknown as Prisma.InputJsonValue },
    });
  } catch (error) {
    return { status: "ERROR", error: friendlyPrismaError(error) };
  }

  const currentRawValues = toStorableChanges(Object.keys(restoreChanges).map((key) => ({ key, value: payload[key] })));
  const before: EnrichmentHistorySnapshot = {
    fieldKey,
    displayValue: mostRecent.after?.displayValue ?? null,
    displayItems: mostRecent.after?.displayItems,
    payloadChanges: currentRawValues,
  };
  const after: EnrichmentHistorySnapshot = {
    fieldKey,
    displayValue: mostRecent.before.displayValue,
    displayItems: mostRecent.before.displayItems,
    payloadChanges: restoreChanges,
  };

  await logAudit(session.userId, actionTypeToStoredAction("REVERT"), ENRICHMENT_HISTORY_ENTITY_TYPE, stagingRecordId, { before, after });

  return { status: "SUCCESS" };
}
