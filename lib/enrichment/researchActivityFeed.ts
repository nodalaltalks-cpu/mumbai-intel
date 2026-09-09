import "server-only";
import { prisma } from "@/lib/prisma";
import { getPendingStagingRecords } from "@/lib/admin-queries";
import type { ProjectImportPayload } from "@/lib/ingestion/connectors/fileImport/types";
import { getResearchActivityForStagingIds, type ResearchFieldStatus } from "./researchAttribution";

/**
 * Data Sync Control Center fix — global "Research Activity" feed (optional
 * per the task's own "if the existing architecture makes it straightforward"
 * framing). Flattens the SAME read-only, AuditLog-derived
 * `getResearchActivityForStagingIds` correlation already powering the
 * per-project badge and "View Research Changes" dialog into one flat,
 * searchable/filterable list across every currently-pending Project staging
 * record -- no new table, no new query pattern (getPendingStagingRecords is
 * the exact same bounded fetch the Review Queue page already performs every
 * load), no analytics system.
 */
export interface ResearchActivityRow {
  stagingRecordId: string;
  projectName: string;
  developerName: string | null;
  localityName: string | null;
  reraNumber: string | null;
  fieldKey: string;
  proposedValue: string | null;
  status: ResearchFieldStatus;
  sourceUrl: string | null;
  proposedAt: string;
  decidedAt: string | null;
  providerLabel: "Claude + Chrome" | "Research Agent";
}

/** Light, non-authoritative label for a compact table column -- the founder-facing field name registries (reviewFieldRegistry.ts) require a full payload+context to build; this feed only needs something readable, not the canonical label. */
function humanizeFieldKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

export async function getResearchActivityFeed(): Promise<ResearchActivityRow[]> {
  const records = await getPendingStagingRecords();
  const projectRecords = records.filter((r) => r.entityType === "Project");
  if (projectRecords.length === 0) return [];

  const activityById = await getResearchActivityForStagingIds(projectRecords.map((r) => r.id));

  const localityIds = [...new Set(projectRecords.map((r) => (r.payload as unknown as ProjectImportPayload).localityId).filter(Boolean))];
  const localities = localityIds.length ? await prisma.locality.findMany({ where: { id: { in: localityIds } }, select: { id: true, name: true } }) : [];
  const localityNameById = new Map(localities.map((l) => [l.id, l.name]));

  const builderIds = [...new Set(projectRecords.map((r) => (r.payload as unknown as ProjectImportPayload).builderId).filter((id): id is string => Boolean(id)))];
  const builders = builderIds.length ? await prisma.builder.findMany({ where: { id: { in: builderIds } }, select: { id: true, name: true } }) : [];
  const builderNameById = new Map(builders.map((b) => [b.id, b.name]));

  const rows: ResearchActivityRow[] = [];
  for (const record of projectRecords) {
    const activity = activityById.get(record.id);
    if (!activity?.hasResearch) continue;
    const payload = record.payload as unknown as ProjectImportPayload;
    const developerName = (payload.builderId ? builderNameById.get(payload.builderId) : null) ?? payload.developerGroup ?? null;
    const localityName = localityNameById.get(payload.localityId) ?? null;
    for (const field of activity.fields) {
      rows.push({
        stagingRecordId: record.id,
        projectName: payload.name,
        developerName,
        localityName,
        reraNumber: payload.reraNumber ?? null,
        fieldKey: field.fieldKey,
        proposedValue: field.proposedValue,
        status: field.status,
        sourceUrl: field.sourceUrl,
        proposedAt: field.proposedAt,
        decidedAt: field.decidedAt,
        providerLabel: activity.providerLabel!,
      });
    }
  }

  rows.sort((a, b) => (a.proposedAt < b.proposedAt ? 1 : -1)); // newest first
  return rows;
}

export { humanizeFieldKey };
