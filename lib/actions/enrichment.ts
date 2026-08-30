"use server";

import { requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { classifyProjectEnrichment } from "@/lib/enrichment/classifyEnrichment";
import { resolveDeveloperDomain } from "@/lib/enrichment/developerDomainRegistry";
import { godrejPropertiesAdapter, GODREJ_SKY_SHORE_PROJECT_URL } from "@/lib/enrichment/adapters/godrejPropertiesAdapter";
import { adaniRealtyAdapter, ADANI_LINKBAY_RESIDENCES_PROJECT_URL } from "@/lib/enrichment/adapters/adaniRealtyAdapter";
import type { EnrichmentField, OfficialSourceAdapter } from "@/lib/enrichment/types";
import type { ProjectImportPayload } from "@/lib/ingestion/connectors/fileImport/types";

export type EnrichProjectStatus = "SUCCESS" | "NO_SOURCE" | "SOURCE_UNAVAILABLE" | "NO_NEW_INFO" | "ERROR";

export interface EnrichProjectResult {
  status: EnrichProjectStatus;
  fields?: EnrichmentField[];
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

  const hasNewInfo = fields.some((f) => f.classification === "GREEN_NEW" || f.classification === "YELLOW" || f.classification === "CONFLICT");
  if (!hasNewInfo) {
    return { status: "NO_NEW_INFO", fields };
  }

  return { status: "SUCCESS", fields };
}
