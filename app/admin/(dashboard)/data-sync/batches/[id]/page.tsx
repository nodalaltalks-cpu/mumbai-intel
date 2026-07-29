import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getIngestBatch, getIngestLogForBatch } from "@/lib/admin-queries";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Sync Batch — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const ACTION_STYLES: Record<string, string> = {
  CREATED: "border-positive/40 text-positive",
  UPDATED: "border-positive/40 text-positive",
  SKIPPED_DUPLICATE: "border-border text-muted",
  STAGED: "border-accent/40 text-accent",
  FAILED: "border-negative/40 text-negative",
};

export default async function IngestBatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [batch, logEntries] = await Promise.all([getIngestBatch(id), getIngestLogForBatch(id)]);
  if (!batch) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/data-sync" className="text-xs font-mono text-muted hover:text-foreground">
        ← Data Sync
      </Link>

      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">{batch.sourceKey}</h1>
        <p className="text-xs text-muted">
          {batch.trigger} · started {formatDate(batch.startedAt)} · {batch.status}
          {batch.note ? ` — ${batch.note}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center text-xs">
        <div className="rounded-sm border border-border p-3">
          <p className="text-lg font-mono text-positive">{batch.recordsWritten}</p>
          <p className="text-muted">Written</p>
        </div>
        <div className="rounded-sm border border-border p-3">
          <p className="text-lg font-mono text-muted">{batch.recordsSkipped}</p>
          <p className="text-muted">Skipped</p>
        </div>
        <div className="rounded-sm border border-border p-3">
          <p className="text-lg font-mono text-negative">{batch.recordsFailed}</p>
          <p className="text-muted">Failed</p>
        </div>
      </div>

      <section className="rounded-sm border border-border">
        <div className="border-b border-border bg-surface px-3 py-2">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-wide text-foreground">Log</h2>
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Entity</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {logEntries.map((entry) => (
                <tr key={entry.id} className="border-b border-border last:border-b-0">
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDate(entry.createdAt)}</td>
                  <td className="px-3 py-2 font-mono text-foreground">{entry.entityType}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] uppercase ${ACTION_STYLES[entry.action] ?? "border-border text-muted"}`}>
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted">{entry.message ?? "--"}</td>
                </tr>
              ))}
              {logEntries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted">
                    No log entries.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
