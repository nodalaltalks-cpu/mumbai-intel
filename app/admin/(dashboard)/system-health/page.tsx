import type { Metadata } from "next";
import { getDatabaseSizeBytes, getStorageSnapshotHistory, getLatestStorageSnapshot, classifyUsagePercent, type StorageThreshold } from "@/lib/system-health";
import { getCloudinaryUsage } from "@/lib/cloudinary";
import { formatBytes, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "System Health — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const THRESHOLD_CLASS: Record<StorageThreshold, string> = {
  NORMAL: "border-positive/40 bg-positive/10 text-positive",
  WATCH: "border-info/40 bg-info/10 text-info",
  WARNING: "border-warning/40 bg-warning/10 text-warning",
  CRITICAL: "border-negative/40 bg-negative/10 text-negative",
};

export default async function SystemHealthPage() {
  // Live values (not the daily snapshot) for "right now" tiles — the snapshot
  // history is for the trend chart below, captured once/day by the cron.
  const [dbSizeBytes, cloudinaryUsage, history, latestSnapshot] = await Promise.all([
    getDatabaseSizeBytes(),
    getCloudinaryUsage(),
    getStorageSnapshotHistory(30),
    getLatestStorageSnapshot(),
  ]);

  const cloudinaryThreshold = cloudinaryUsage?.creditsUsedPercent !== null && cloudinaryUsage?.creditsUsedPercent !== undefined
    ? classifyUsagePercent(cloudinaryUsage.creditsUsedPercent)
    : null;

  const firstSnapshot = history[0] ?? null;
  const dbGrowthBytes = firstSnapshot?.dbSizeBytes !== null && firstSnapshot?.dbSizeBytes !== undefined && dbSizeBytes !== null
    ? dbSizeBytes - firstSnapshot.dbSizeBytes
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">System Health</h1>
        <p className="text-xs text-muted">
          Database and file-storage usage, from Postgres's own size accounting and Cloudinary's Admin API — so a storage/cost problem shows up here before it becomes one.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Database size</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{formatBytes(dbSizeBytes)}</p>
          <p className="mt-1 text-[11px] text-muted">
            {dbGrowthBytes !== null ? `${dbGrowthBytes >= 0 ? "+" : ""}${formatBytes(dbGrowthBytes)} in last 30d` : "No trend yet"}
          </p>
        </div>

        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Cloudinary storage</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{formatBytes(cloudinaryUsage?.storageBytes ?? null)}</p>
          <p className="mt-1 text-[11px] text-muted">{cloudinaryUsage?.objectCount ?? "--"} files stored</p>
        </div>

        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Cloudinary plan credits used</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">
            {cloudinaryUsage?.creditsUsedPercent !== null && cloudinaryUsage?.creditsUsedPercent !== undefined ? `${cloudinaryUsage.creditsUsedPercent}%` : "--"}
          </p>
          {cloudinaryThreshold ? (
            <span className={`mt-1 inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide ${THRESHOLD_CLASS[cloudinaryThreshold]}`}>
              {cloudinaryThreshold}
            </span>
          ) : (
            <p className="mt-1 text-[11px] text-muted">No plan limit reported</p>
          )}
        </div>

        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Last daily snapshot</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{latestSnapshot ? formatDate(latestSnapshot.capturedAt) : "--"}</p>
          <p className="mt-1 text-[11px] text-muted">Captured once/day by the storage-snapshot cron</p>
        </div>
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Thresholds</h2>
        <p className="mb-3 text-[11px] text-muted">
          Applied to Cloudinary's plan-credit usage (a real, provider-reported limit). Database size has no such limit exposed without a separate Neon Management API key, so it's shown as size + trend only, deliberately with no color band.
        </p>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-sm border px-2 py-1 text-[11px] font-mono uppercase tracking-wide ${THRESHOLD_CLASS.NORMAL}`}>Normal &lt; 60%</span>
          <span className={`rounded-sm border px-2 py-1 text-[11px] font-mono uppercase tracking-wide ${THRESHOLD_CLASS.WATCH}`}>Watch 60–80%</span>
          <span className={`rounded-sm border px-2 py-1 text-[11px] font-mono uppercase tracking-wide ${THRESHOLD_CLASS.WARNING}`}>Warning 80–90%</span>
          <span className={`rounded-sm border px-2 py-1 text-[11px] font-mono uppercase tracking-wide ${THRESHOLD_CLASS.CRITICAL}`}>Critical &gt; 90%</span>
        </div>
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">30-day history</h2>
        {history.length === 0 ? (
          <p className="text-xs text-muted">No snapshots yet — the first one is captured by tomorrow's storage-snapshot cron run.</p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-border">
            <table className="w-full min-w-[520px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium text-right">DB size</th>
                  <th className="px-3 py-2 font-medium text-right">Cloudinary storage</th>
                  <th className="px-3 py-2 font-medium text-right">Files</th>
                  <th className="px-3 py-2 font-medium text-right">Credits used</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((point) => (
                  <tr key={point.capturedAt.toISOString()} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 font-mono text-foreground">{formatDate(point.capturedAt)}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{formatBytes(point.dbSizeBytes)}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{formatBytes(point.cloudinaryStorageBytes)}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{point.cloudinaryObjectCount ?? "--"}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{point.cloudinaryCreditsUsedPercent !== null ? `${point.cloudinaryCreditsUsedPercent}%` : "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
