import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/guard";
import { getDiscoveryCandidates } from "@/lib/admin-queries";
import { prisma } from "@/lib/prisma";
import { applyDiscoveryFounderAction } from "@/lib/actions/discovery";
import type { DiscoveryStatus, ProjectDiscoveryCandidatePayload } from "@/lib/ingestion/discovery/types";
import DiscoveryCandidateList, { type DiscoveryCandidateRow } from "@/app/admin/components/DiscoveryCandidateList";
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

  const matchedIds = records.map((r) => r.matchedExistingId).filter((id): id is string => Boolean(id));
  const matchedProjects = matchedIds.length
    ? await prisma.project.findMany({ where: { id: { in: matchedIds } }, select: { id: true, name: true } })
    : [];
  const matchedNameById = new Map(matchedProjects.map((p) => [p.id, p.name]));

  const rows: DiscoveryCandidateRow[] = records.map((r) => ({
    id: r.id,
    status: r.status as DiscoveryStatus,
    payload: r.payload as unknown as ProjectDiscoveryCandidatePayload,
    matchedExistingName: r.matchedExistingId ? (matchedNameById.get(r.matchedExistingId) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
  }));

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

      {rows.length === 0 ? (
        <EmptyState title="No discovery candidates yet" message="Run a discovery batch for an area to populate this list." />
      ) : (
        <DiscoveryCandidateList rows={rows} onAction={applyDiscoveryFounderAction} />
      )}
    </div>
  );
}
