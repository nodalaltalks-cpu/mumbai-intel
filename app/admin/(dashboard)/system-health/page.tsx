import type { Metadata } from "next";
import {
  getDatabaseSizeBytes,
  getStorageSnapshotHistory,
  getLatestStorageSnapshot,
  classifyUsagePercent,
  getCronJobStatuses,
  getReportHealthStats,
  getNotificationHealthStats,
  getEmailHealthStats,
  type StorageThreshold,
} from "@/lib/system-health";
import { getCloudinaryUsage } from "@/lib/cloudinary";
import { formatBytes, formatDate, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "System Health — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const THRESHOLD_CLASS: Record<StorageThreshold, string> = {
  NORMAL: "border-positive/40 bg-positive/10 text-positive",
  WATCH: "border-info/40 bg-info/10 text-info",
  WARNING: "border-warning/40 bg-warning/10 text-warning",
  CRITICAL: "border-negative/40 bg-negative/10 text-negative",
};

/** REAL-TIME = computed fresh on this page load. LAST UPDATED = read from a stored snapshot/record, may be stale by however long since that record was written. Every tile below carries one of these two badges explicitly so nothing cached is ever mistaken for live. */
function DataBadge({ kind }: { kind: "real-time" | "last-updated" }) {
  return kind === "real-time" ? (
    <span className="inline-flex items-center gap-1 rounded-sm border border-positive/40 bg-positive/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-positive">
      <span className="h-1 w-1 rounded-full bg-positive" aria-hidden="true" />
      Real-time
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-muted">Last updated</span>
  );
}

export default async function SystemHealthPage() {
  // Live values (not the daily snapshot) for "right now" tiles — the snapshot
  // history is for the trend chart below, captured once/day by the cron.
  const [dbSizeBytes, cloudinaryUsage, history, latestSnapshot, crons, reportHealth, notificationHealth, emailHealth] = await Promise.all([
    getDatabaseSizeBytes(),
    getCloudinaryUsage(),
    getStorageSnapshotHistory(30),
    getLatestStorageSnapshot(),
    getCronJobStatuses(),
    getReportHealthStats(),
    getNotificationHealthStats(),
    getEmailHealthStats(),
  ]);

  const dbConnectionOk = dbSizeBytes !== null;
  const cloudinaryThreshold = cloudinaryUsage?.creditsUsedPercent !== null && cloudinaryUsage?.creditsUsedPercent !== undefined
    ? classifyUsagePercent(cloudinaryUsage.creditsUsedPercent)
    : null;

  const firstSnapshot = history[0] ?? null;
  const dbGrowthBytes = firstSnapshot?.dbSizeBytes !== null && firstSnapshot?.dbSizeBytes !== undefined && dbSizeBytes !== null
    ? dbSizeBytes - firstSnapshot.dbSizeBytes
    : null;
  const lastSnapshotEntry = history[history.length - 1] ?? null;
  const cloudinaryGrowthBytes = firstSnapshot?.cloudinaryStorageBytes !== null && firstSnapshot?.cloudinaryStorageBytes !== undefined && lastSnapshotEntry?.cloudinaryStorageBytes !== null && lastSnapshotEntry?.cloudinaryStorageBytes !== undefined
    ? lastSnapshotEntry.cloudinaryStorageBytes - firstSnapshot.cloudinaryStorageBytes
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">System Health</h1>
        <p className="text-xs text-muted">
          Database and file-storage usage, from Postgres&apos;s own size accounting and Cloudinary&apos;s Admin API — so a storage/cost problem shows up here before it becomes one.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-sm border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wide text-muted">Database connection</p>
            <DataBadge kind="real-time" />
          </div>
          <p className={`mt-1.5 font-mono text-xl font-semibold ${dbConnectionOk ? "text-positive" : "text-negative"}`}>{dbConnectionOk ? "OK" : "FAILED"}</p>
          <p className="mt-1 text-[11px] text-muted">Checked via this page&apos;s own database read, right now.</p>
        </div>

        <div className="rounded-sm border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wide text-muted">Database size</p>
            <DataBadge kind="real-time" />
          </div>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{formatBytes(dbSizeBytes)}</p>
          <p className="mt-1 text-[11px] text-muted">
            {dbGrowthBytes !== null ? `${dbGrowthBytes >= 0 ? "+" : ""}${formatBytes(dbGrowthBytes)} in last 30d` : "No trend yet"}
          </p>
        </div>

        <div className="rounded-sm border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wide text-muted">Cloudinary storage</p>
            <DataBadge kind="real-time" />
          </div>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{formatBytes(cloudinaryUsage?.storageBytes ?? null)}</p>
          <p className="mt-1 text-[11px] text-muted">
            {cloudinaryUsage?.objectCount ?? "--"} files · {cloudinaryGrowthBytes !== null ? `${cloudinaryGrowthBytes >= 0 ? "+" : ""}${formatBytes(cloudinaryGrowthBytes)} / 30d` : "No trend yet"}
          </p>
        </div>

        <div className="rounded-sm border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wide text-muted">Cloudinary plan credits used</p>
            <DataBadge kind="real-time" />
          </div>
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
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wide text-muted">Last daily snapshot</p>
            <DataBadge kind="last-updated" />
          </div>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{latestSnapshot ? formatDate(latestSnapshot.capturedAt) : "--"}</p>
          <p className="mt-1 text-[11px] text-muted">Captured once/day by the storage-snapshot cron</p>
        </div>
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Thresholds</h2>
        <p className="mb-3 text-[11px] text-muted">
          Applied to Cloudinary&apos;s plan-credit usage (a real, provider-reported limit). Database size has no such limit exposed without a separate Neon Management API key, so it&apos;s shown as size + trend only, deliberately with no color band.
        </p>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-sm border px-2 py-1 text-[11px] font-mono uppercase tracking-wide ${THRESHOLD_CLASS.NORMAL}`}>Normal &lt; 60%</span>
          <span className={`rounded-sm border px-2 py-1 text-[11px] font-mono uppercase tracking-wide ${THRESHOLD_CLASS.WATCH}`}>Watch 60–80%</span>
          <span className={`rounded-sm border px-2 py-1 text-[11px] font-mono uppercase tracking-wide ${THRESHOLD_CLASS.WARNING}`}>Warning 80–90%</span>
          <span className={`rounded-sm border px-2 py-1 text-[11px] font-mono uppercase tracking-wide ${THRESHOLD_CLASS.CRITICAL}`}>Critical &gt; 90%</span>
        </div>
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-mono text-sm font-semibold text-foreground">Cron / background jobs</h2>
          <DataBadge kind="real-time" />
        </div>
        <p className="mb-3 text-[11px] text-muted">Schedule mirrors vercel.json. "Last success" traces to a real record this job itself writes — shown as "Not tracked" where no such record exists, never guessed.</p>
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full min-w-[560px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Job</th>
                <th className="px-3 py-2 font-medium">Schedule</th>
                <th className="px-3 py-2 font-medium">Next run</th>
                <th className="px-3 py-2 font-medium">Last success</th>
              </tr>
            </thead>
            <tbody>
              {crons.map((c) => (
                <tr key={c.path} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 font-mono text-foreground">{c.label}</td>
                  <td className="px-3 py-2 text-muted">{c.scheduleLabel}</td>
                  <td className="px-3 py-2 text-muted">{formatDateTime(c.nextRunAt)}</td>
                  <td className="px-3 py-2 text-muted">{c.lastSuccessAt ? `${formatDateTime(c.lastSuccessAt)} (${c.lastSuccessSource})` : "Not tracked"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-sm border border-border bg-surface p-4">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-mono text-sm font-semibold text-foreground">Reports</h2>
            <DataBadge kind="real-time" />
          </div>
          <dl className="mt-2 flex flex-col gap-1.5 text-xs">
            <div className="flex justify-between"><dt className="text-muted">Open</dt><dd className="font-mono text-foreground">{reportHealth.open}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Accepted</dt><dd className="font-mono text-foreground">{reportHealth.accepted}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Rejected</dt><dd className="font-mono text-foreground">{reportHealth.rejected}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Resolved</dt><dd className="font-mono text-foreground">{reportHealth.resolved}</dd></div>
            <div className="flex justify-between">
              <dt className="text-muted">Unresolved beyond 48h</dt>
              <dd className={`font-mono ${reportHealth.unresolvedBeyondSlaCount > 0 ? "text-negative" : "text-foreground"}`}>{reportHealth.unresolvedBeyondSlaCount}</dd>
            </div>
            <div className="flex justify-between"><dt className="text-muted">Avg. resolution time</dt><dd className="font-mono text-foreground">{reportHealth.avgResolutionHours !== null ? `${reportHealth.avgResolutionHours}h` : "--"}</dd></div>
          </dl>
        </section>

        <section className="rounded-sm border border-border bg-surface p-4">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-mono text-sm font-semibold text-foreground">Notifications</h2>
            <DataBadge kind="real-time" />
          </div>
          <dl className="mt-2 flex flex-col gap-1.5 text-xs">
            <div className="flex justify-between"><dt className="text-muted">Unread (admin)</dt><dd className="font-mono text-foreground">{notificationHealth.unreadAdminNotifications}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Unresolved report alerts</dt><dd className="font-mono text-foreground">{notificationHealth.unresolvedReportNotifications}</dd></div>
          </dl>
          <p className="mt-2 text-[10px] text-muted">Server errors / failed operations feed: not tracked today — no in-app error log exists yet, only Vercel&apos;s own function logs.</p>
        </section>

        <section className="rounded-sm border border-border bg-surface p-4">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-mono text-sm font-semibold text-foreground">Email</h2>
            <DataBadge kind="real-time" />
          </div>
          <dl className="mt-2 flex flex-col gap-1.5 text-xs">
            <div className="flex justify-between"><dt className="text-muted">Accepted (24h)</dt><dd className="font-mono text-foreground">{emailHealth.acceptedLast24h}</dd></div>
            <div className="flex justify-between">
              <dt className="text-muted">Failed (24h)</dt>
              <dd className={`font-mono ${emailHealth.failedLast24h > 0 ? "text-negative" : "text-foreground"}`}>{emailHealth.failedLast24h}</dd>
            </div>
            <div className="flex justify-between"><dt className="text-muted">Accepted (all time)</dt><dd className="font-mono text-foreground">{emailHealth.acceptedAllTime}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Failed (all time)</dt><dd className="font-mono text-foreground">{emailHealth.failedAllTime}</dd></div>
          </dl>
          <p className="mt-2 text-[10px] text-muted">"Accepted" means Resend&apos;s API accepted the send — never proof of delivery (no provider webhook wired up).</p>
        </section>
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-sm font-semibold text-foreground">30-day storage history</h2>
          <DataBadge kind="last-updated" />
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-muted">No snapshots yet — the first one is captured by tomorrow&apos;s storage-snapshot cron run.</p>
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
