import type { Metadata } from "next";
import { getPendingStagingRecords } from "@/lib/admin-queries";
import { prisma } from "@/lib/prisma";
import { approveStagingRecordAction, rejectStagingRecordAction } from "@/lib/actions/ingestion";
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

  const matchedIds = records.map((r) => r.matchedExistingId).filter((id): id is string => Boolean(id));
  const matchedAssets = matchedIds.length
    ? await prisma.infraAsset.findMany({ where: { id: { in: matchedIds } }, select: { id: true, name: true, type: true, latitude: true, longitude: true } })
    : [];
  const matchedById = new Map(matchedAssets.map((a) => [a.id, a]));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Review Queue</h1>
        <p className="text-xs text-muted">
          Candidates a sync couldn&apos;t safely auto-apply — a possible duplicate of an existing record. Nothing here has touched the catalog yet.
        </p>
      </div>

      {records.length === 0 ? (
        <EmptyState title="Nothing to review" message="All synced records were either new or already matched exactly." />
      ) : (
        <div className="flex flex-col gap-3">
          {records.map((record) => {
            const payload = record.payload as unknown as InfraStagingPayload;
            const matched = record.matchedExistingId ? matchedById.get(record.matchedExistingId) : null;
            return (
              <div key={record.id} className="rounded-sm border border-border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="grid flex-1 grid-cols-2 gap-4 text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted">Proposed (from {record.batch.sourceKey})</p>
                      <p className="mt-1 font-mono text-foreground">{payload.name}</p>
                      <p className="text-muted">{payload.type} · {payload.latitude.toFixed(5)}, {payload.longitude.toFixed(5)}</p>
                      <p className="text-muted">{payload.sourceRef}</p>
                    </div>
                    {matched ? (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted">Possible match (existing, manually curated)</p>
                        <p className="mt-1 font-mono text-foreground">{matched.name}</p>
                        <p className="text-muted">
                          {matched.type} · {matched.latitude?.toFixed(5)}, {matched.longitude?.toFixed(5)}
                        </p>
                        {record.matchConfidence !== null ? (
                          <p className="text-muted">confidence {Number(record.matchConfidence).toFixed(2)}</p>
                        ) : null}
                      </div>
                    ) : (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted">No existing match found</p>
                        <p className="mt-1 text-muted">Staged for review by source policy.</p>
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
