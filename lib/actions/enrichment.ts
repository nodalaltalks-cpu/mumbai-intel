"use server";

import { requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { classifyProjectEnrichment } from "@/lib/enrichment/classifyEnrichment";
import { resolveDeveloperDomain } from "@/lib/enrichment/developerDomainRegistry";
import { applyAcceptedField } from "@/lib/enrichment/applyAcceptedField";
import { buildEntityMatchProposal, resolveBuilderMatch, resolveLocalityMatch, type EntityMatchProposal } from "@/lib/enrichment/resolveNamedEntity";
import { godrejPropertiesAdapter, GODREJ_SKY_SHORE_PROJECT_URL } from "@/lib/enrichment/adapters/godrejPropertiesAdapter";
import { adaniRealtyAdapter, ADANI_LINKBAY_RESIDENCES_PROJECT_URL } from "@/lib/enrichment/adapters/adaniRealtyAdapter";
import type { EnrichmentField, OfficialSourceAdapter } from "@/lib/enrichment/types";
import { buildProjectReviewCompleteness } from "@/lib/ingestion/reviewFieldRegistry";
import type { ProjectImportPayload } from "@/lib/ingestion/connectors/fileImport/types";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
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
 * Same auth bar as enrichProjectAction (Part K) -- accepting a field is a
 * staging-only write, not the higher-stakes catalog write approval requires.
 */
export async function acceptEnrichmentFieldAction(
  stagingRecordId: string,
  fieldKey: string,
  proposedValue: string,
  proposedItems?: string[]
): Promise<AcceptEnrichmentFieldResult> {
  await requireMutateSession();

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
