import Link from "next/link";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/guard";
import { getIngestSources, getRecentIngestBatches, getPendingStagingRecords, getFailedIngestBatches } from "@/lib/admin-queries";
import { triggerSyncAction, toggleIngestSourceEnabledAction, retryFailedBatchAction } from "@/lib/actions/ingestion";
import { formatDate } from "@/lib/format";
import ConfirmButton from "@/app/admin/components/ConfirmButton";

export const metadata: Metadata = { title: "Data Sync — Mumbai Intel Admin" };
export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  success: "border-positive/40 text-positive",
  failed: "border-negative/40 text-negative",
  running: "border-accent/40 text-accent",
  pending: "border-border text-muted",
};

export default async function DataSyncPage() {
  const session = await requireSession();
  const [sources, batches, pending, failedBatches] = await Promise.all([
    getIngestSources(),
    getRecentIngestBatches(15),
    getPendingStagingRecords(),
    getFailedIngestBatches(10),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Data Sync</h1>
        <p className="text-xs text-muted">Automated ingestion from authentic public sources — every write is logged and provenance-tagged.</p>
      </div>

      {pending.length > 0 ? (
        <Link
          href="/admin/data-sync/review"
          className="rounded-sm border border-accent/40 bg-accent/10 px-4 py-3 text-xs font-mono text-accent hover:bg-accent/20"
        >
          {pending.length} record{pending.length === 1 ? "" : "s"} awaiting review →
        </Link>
      ) : null}

      <section className="rounded-sm border border-border">
        <div className="border-b border-border bg-surface px-3 py-2">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-wide text-foreground">Sources</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Last run</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                  <td className="px-3 py-2">
                    <p className="font-mono text-foreground">{source.label}</p>
                    <p className="text-[10px] text-muted">{source.key}</p>
                  </td>
                  <td className="px-3 py-2 text-muted">{source.kind}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] uppercase ${source.enabled ? "border-positive/40 text-positive" : "border-border text-muted"}`}>
                      {source.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted">{formatDate(source.lastRunAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      {source.kind === "DATASET_UPLOAD" ? (
                        <Link
                          href="/admin/data-sync/import"
                          className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                        >
                          Upload file
                        </Link>
                      ) : (
                        <ConfirmButton action={triggerSyncAction.bind(null, source.key)} label="Sync now" confirmLabel="Run sync?" />
                      )}
                      {session.role === "ADMIN" ? (
                        <ConfirmButton
                          action={toggleIngestSourceEnabledAction.bind(null, source.key, !source.enabled)}
                          label={source.enabled ? "Disable" : "Enable"}
                          confirmLabel="Confirm?"
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {sources.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted">
                    No sources registered yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-sm border border-border">
        <div className="border-b border-border bg-surface px-3 py-2">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-wide text-foreground">Recent batches</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Trigger</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 font-medium">Written / Skipped / Failed</th>
                <th className="px-3 py-2 font-medium text-right">Log</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                  <td className="px-3 py-2 font-mono text-foreground">{batch.sourceKey}</td>
                  <td className="px-3 py-2 text-muted">{batch.trigger}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] uppercase ${STATUS_STYLES[batch.status] ?? "border-border text-muted"}`}>
                      {batch.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted">{formatDate(batch.startedAt)}</td>
                  <td className="px-3 py-2 text-muted">
                    {batch.recordsWritten} / {batch.recordsSkipped} / {batch.recordsFailed}
                    {batch._count.stagingRecords > 0 ? ` (${batch._count.stagingRecords} staged)` : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/admin/data-sync/batches/${batch.id}`} className="font-mono text-accent hover:underline">
                      View ({batch._count.logEntries})
                    </Link>
                  </td>
                </tr>
              ))}
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted">
                    No sync runs yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {failedBatches.length > 0 ? (
        <section className="rounded-sm border border-negative/40">
          <div className="border-b border-negative/40 bg-negative/5 px-3 py-2">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wide text-negative">Failed imports</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Started</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {failedBatches.map((batch) => (
                  <tr key={batch.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                    <td className="px-3 py-2 font-mono text-foreground">{batch.sourceKey}</td>
                    <td className="px-3 py-2 text-muted">{formatDate(batch.startedAt)}</td>
                    <td className="px-3 py-2 text-negative">{batch.note ?? "Unknown error"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/admin/data-sync/batches/${batch.id}`} className="font-mono text-accent hover:underline">
                          View log
                        </Link>
                        {batch.sourceKind === "API" ? (
                          <ConfirmButton action={retryFailedBatchAction.bind(null, batch.id)} label="Retry" confirmLabel="Retry sync?" />
                        ) : (
                          <span className="text-[10px] uppercase text-muted">Re-upload file to retry</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
