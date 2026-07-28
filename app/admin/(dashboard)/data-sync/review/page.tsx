import type { Metadata } from "next";
import { getPendingStagingRecords } from "@/lib/admin-queries";
import { prisma } from "@/lib/prisma";
import { approveStagingRecordAction, rejectStagingRecordAction } from "@/lib/actions/ingestion";
import { formatPriceBand } from "@/lib/format";
import { STATUS_LABEL, CATEGORY_LABEL, type ProjectStatus, type PropertyCategory } from "@/lib/project-meta";
import type { ProjectImportPayload } from "@/lib/ingestion/connectors/fileImport/types";
import ConfirmButton from "@/app/admin/components/ConfirmButton";
import EmptyState from "@/app/components/ui/EmptyState";

export const metadata: Metadata = { title: "Review Queue — Mumbai Intel Admin" };
export const dynamic = "force-dynamic";

interface InfraStagingPayload {
  type: string;
  name: string;
  latitude: number;
  longitude: number;
  sourceRef: string;
  detail?: string;
}

export default async function DataSyncReviewPage() {
  const records = await getPendingStagingRecords();

  const infraRecords = records.filter((r) => r.entityType === "InfraAsset");
  const projectRecords = records.filter((r) => r.entityType === "Project");

  const matchedInfraIds = infraRecords.map((r) => r.matchedExistingId).filter((id): id is string => Boolean(id));
  const matchedInfra = matchedInfraIds.length
    ? await prisma.infraAsset.findMany({ where: { id: { in: matchedInfraIds } }, select: { id: true, name: true, type: true, latitude: true, longitude: true } })
    : [];
  const matchedInfraById = new Map(matchedInfra.map((a) => [a.id, a]));

  const matchedProjectIds = projectRecords.map((r) => r.matchedExistingId).filter((id): id is string => Boolean(id));
  const matchedProjects = matchedProjectIds.length
    ? await prisma.project.findMany({ where: { id: { in: matchedProjectIds } }, select: { id: true, name: true, reraNumber: true, status: true } })
    : [];
  const matchedProjectById = new Map(matchedProjects.map((p) => [p.id, p]));

  const localityIds = [...new Set(projectRecords.map((r) => (r.payload as unknown as ProjectImportPayload).localityId))];
  const localities = localityIds.length ? await prisma.locality.findMany({ where: { id: { in: localityIds } }, select: { id: true, name: true } }) : [];
  const localityNameById = new Map(localities.map((l) => [l.id, l.name]));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Review Queue</h1>
        <p className="text-xs text-muted">
          Candidates an import couldn&apos;t safely auto-apply — new or possibly-duplicate records awaiting a decision. Nothing here has touched the catalog yet.
        </p>
      </div>

      {records.length === 0 ? (
        <EmptyState title="Nothing to review" message="All imported/synced records were either new or already matched exactly." />
      ) : (
        <div className="flex flex-col gap-3">
          {records.map((record) => {
            const isProject = record.entityType === "Project";
            const infraPayload = !isProject ? (record.payload as unknown as InfraStagingPayload) : null;
            const projectPayload = isProject ? (record.payload as unknown as ProjectImportPayload) : null;
            const matchedInfraAsset = infraPayload && record.matchedExistingId ? matchedInfraById.get(record.matchedExistingId) : null;
            const matchedProject = projectPayload && record.matchedExistingId ? matchedProjectById.get(record.matchedExistingId) : null;

            return (
              <div key={record.id} className="rounded-sm border border-border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="grid flex-1 grid-cols-2 gap-4 text-xs">
                    {projectPayload ? (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted">Proposed (from {record.batch.sourceKey})</p>
                        <p className="mt-1 font-mono text-foreground">{projectPayload.name}</p>
                        <p className="text-muted">
                          {STATUS_LABEL[projectPayload.status as ProjectStatus]} · {CATEGORY_LABEL[projectPayload.category as PropertyCategory]} ·{" "}
                          {localityNameById.get(projectPayload.localityId) ?? "Unknown locality"}
                        </p>
                        {projectPayload.reraNumber ? <p className="text-muted">RERA {projectPayload.reraNumber}</p> : null}
                        {projectPayload.priceMinRupees || projectPayload.priceMaxRupees ? (
                          <p className="text-muted">{formatPriceBand(projectPayload.priceMinRupees ? projectPayload.priceMinRupees * 100 : null, projectPayload.priceMaxRupees ? projectPayload.priceMaxRupees * 100 : null)}</p>
                        ) : null}
                      </div>
                    ) : infraPayload ? (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted">Proposed (from {record.batch.sourceKey})</p>
                        <p className="mt-1 font-mono text-foreground">{infraPayload.name}</p>
                        <p className="text-muted">
                          {infraPayload.type} · {infraPayload.latitude.toFixed(5)}, {infraPayload.longitude.toFixed(5)}
                        </p>
                        <p className="text-muted">{infraPayload.sourceRef}</p>
                      </div>
                    ) : null}

                    {matchedProject ? (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted">Possible match (existing project)</p>
                        <p className="mt-1 font-mono text-foreground">{matchedProject.name}</p>
                        <p className="text-muted">{STATUS_LABEL[matchedProject.status]}{matchedProject.reraNumber ? ` · RERA ${matchedProject.reraNumber}` : ""}</p>
                        {record.matchConfidence !== null ? <p className="text-muted">confidence {Number(record.matchConfidence).toFixed(2)}</p> : null}
                      </div>
                    ) : matchedInfraAsset ? (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted">Possible match (existing, manually curated)</p>
                        <p className="mt-1 font-mono text-foreground">{matchedInfraAsset.name}</p>
                        <p className="text-muted">
                          {matchedInfraAsset.type} · {matchedInfraAsset.latitude?.toFixed(5)}, {matchedInfraAsset.longitude?.toFixed(5)}
                        </p>
                        {record.matchConfidence !== null ? <p className="text-muted">confidence {Number(record.matchConfidence).toFixed(2)}</p> : null}
                      </div>
                    ) : (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted">No existing match found</p>
                        <p className="mt-1 text-muted">{isProject ? "Will be created as a new, unpublished project." : "Staged for review by source policy."}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <ConfirmButton
                      action={approveStagingRecordAction.bind(null, record.id)}
                      label="Approve"
                      confirmLabel="Approve?"
                      className="border-positive/40 text-positive hover:border-positive hover:text-positive"
                    />
                    <ConfirmButton action={rejectStagingRecordAction.bind(null, record.id)} label="Reject" confirmLabel="Reject?" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
