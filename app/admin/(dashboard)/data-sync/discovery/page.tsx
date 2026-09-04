import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/guard";
import { getDiscoveryCandidates } from "@/lib/admin-queries";
import { prisma } from "@/lib/prisma";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import { applyDiscoveryFounderAction, updateDiscoveryCandidateDetails } from "@/lib/actions/discovery";
import { computeLiveDuplicateStatuses } from "@/lib/ingestion/discovery/liveDuplicateStatus";
import type { DiscoveryStatus, ProjectDiscoveryCandidatePayload } from "@/lib/ingestion/discovery/types";
import type { ProjectImportPayload } from "@/lib/ingestion/connectors/fileImport/types";
import DiscoveryCandidateList, { type DiscoveryCandidateRow } from "@/app/admin/components/DiscoveryCandidateList";
import MumbaiDiscoveryRunForm from "@/app/admin/components/MumbaiDiscoveryRunForm";
import HousieyLocalityRunForm from "@/app/admin/components/HousieyLocalityRunForm";
import EmptyState from "@/app/components/ui/EmptyState";

export const metadata: Metadata = { title: "Project Discovery — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

/**
 * Phase 39 Part I — founder review surface for ProjectDiscoveryCandidate
 * staging rows. A separate, deliberately small page (not a tab bolted onto
 * the existing Review Queue) since these rows are pre-enrichment candidates,
 * not proposed Project/Builder/Locality/Transaction writes — see
 * lib/ingestion/discovery/types.ts for why the two never collide in the same
 * table.
 */
export default async function ProjectDiscoveryPage() {
  await requireSession();
  const records = await getDiscoveryCandidates();

  // Phase 58 — matchedExistingId can point to EITHER a live Project OR a
  // still-pending "Project"-entityType staging record (applyDiscoveryFounderAction's
  // own combinedExisting checks both — lib/actions/discovery.ts). The original
  // lookup here only ever queried the live Project table, so a candidate rejected
  // as a duplicate of a still-PENDING staged Project (the exact real-world "Godrej
  // Skyshore" case) silently resolved to no match name at all. Both sources are
  // checked now, matching Include's own duplicate-detection scope exactly.
  const matchedIds = records.map((r) => r.matchedExistingId).filter((id): id is string => Boolean(id));
  const [matchedProjects, matchedPendingStaging] = matchedIds.length
    ? await Promise.all([
        prisma.project.findMany({ where: { id: { in: matchedIds } }, select: { id: true, name: true } }),
        prisma.ingestStagingRecord.findMany({ where: { id: { in: matchedIds }, entityType: "Project" }, select: { id: true, payload: true } }),
      ])
    : [[], []];
  const matchedNameById = new Map<string, string>([
    ...matchedProjects.map((p): [string, string] => [p.id, p.name]),
    ...matchedPendingStaging.map((r): [string, string] => [r.id, (r.payload as unknown as ProjectImportPayload).name]),
  ]);

  // Phase 58 — a candidate's stored duplicateStatus is a snapshot from
  // whenever it was originally staged; re-check the still-open ones live
  // (same authority Include's own check already uses) so the badge never
  // shows "NO MATCH" for something Include would actually refuse. Only the
  // still-open candidates matter here — a REJECTED_DUPLICATE/PROJECT_STAGED/
  // EXCLUDED row is already resolved and never re-offers Include.
  const OPEN_STATUSES: DiscoveryStatus[] = ["DISCOVERED", "SOURCE_FOUND", "NEEDS_REVIEW"];
  const openCandidates = records
    .filter((r) => OPEN_STATUSES.includes(r.status as DiscoveryStatus))
    .map((r) => ({ id: r.id, payload: r.payload as unknown as ProjectDiscoveryCandidatePayload }));
  const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG }, select: { id: true } });
  const liveDuplicateByCandidateId = city ? await computeLiveDuplicateStatuses(prisma, city.id, openCandidates) : new Map();

  const rows: DiscoveryCandidateRow[] = records.map((r) => {
    const live = liveDuplicateByCandidateId.get(r.id) ?? null;
    return {
      id: r.id,
      status: r.status as DiscoveryStatus,
      payload: r.payload as unknown as ProjectDiscoveryCandidatePayload,
      matchedExistingName: r.matchedExistingId ? (matchedNameById.get(r.matchedExistingId) ?? null) : null,
      liveDuplicateStatus: live?.duplicateStatus ?? null,
      liveDuplicateMatch: live?.match ?? null,
      createdAt: r.createdAt.toISOString(),
      /** Phase 59 — non-null once a founder has made ANY Include/Exclude/Review decision on this row, used to decide whether changing it now needs a confirmation. */
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    };
  });

  const batchLabel = rows[0]?.payload.batchLabel ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Project Discovery</h1>
        <p className="mt-1 text-xs text-muted">
          {batchLabel ? `${batchLabel} — ` : ""}
          {rows.length} candidate{rows.length === 1 ? "" : "s"}. Discovery source ≠ authoritative source — official developer sites are still used
          for enrichment once a candidate is Included.
        </p>
      </div>

      <MumbaiDiscoveryRunForm />
      <HousieyLocalityRunForm />

      {rows.length === 0 ? (
        <EmptyState title="No discovery candidates yet" message="Run a discovery batch for an area to populate this list." />
      ) : (
        <DiscoveryCandidateList rows={rows} onAction={applyDiscoveryFounderAction} onEdit={updateDiscoveryCandidateDetails} />
      )}
    </div>
  );
}
