import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth/guard";
import { getLivePlatformStatus, getPlatformMetricHistory, getPeakTraffic, getCapacityGrowthTrend } from "@/lib/platform-metrics/queries";
import { getPlatformAlertHistory } from "@/lib/platform-metrics/alerts";
import { formatDateTime } from "@/lib/format";
import type { PlatformLoadState } from "@prisma/client";
import AutoRefresh from "./AutoRefresh";

export const metadata: Metadata = { title: "Platform Health — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const STATE_CLASS: Record<PlatformLoadState, string> = {
  NORMAL: "border-positive/40 bg-positive/10 text-positive",
  WATCH: "border-info/40 bg-info/10 text-info",
  WARNING: "border-warning/40 bg-warning/10 text-warning",
  CRITICAL: "border-negative/40 bg-negative/10 text-negative",
};

const STATE_LABEL: Record<PlatformLoadState, string> = {
  NORMAL: "HEALTHY",
  WATCH: "ELEVATED LOAD",
  WARNING: "HIGH LOAD",
  CRITICAL: "CRITICAL",
};

function DataBadge({ kind }: { kind: "real-time" | "instance-sampled" }) {
  return kind === "real-time" ? (
    <span className="inline-flex items-center gap-1 rounded-sm border border-positive/40 bg-positive/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-positive">
      <span className="h-1 w-1 rounded-full bg-positive" aria-hidden="true" />
      Real-time
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-muted">Instance-sampled</span>
  );
}

export default async function PlatformHealthPage() {
  // ADMIN only — this page is deliberately not reachable by EDITOR/VIEWER
  // (Part 4: "Employees should NOT automatically receive infrastructure
  // visibility"). requireSession() alone would allow any role; this must
  // stay requireAdminSession().
  await requireAdminSession();

  const [{ activeCounts, db, assessment }, history, peaks, growth, alerts] = await Promise.all([
    getLivePlatformStatus(),
    getPlatformMetricHistory(72),
    getPeakTraffic(),
    getCapacityGrowthTrend(),
    getPlatformAlertHistory(20),
  ]);

  const errorRatePercent = db.totalCount > 0 ? ((db.errorCount / db.totalCount) * 100).toFixed(2) : "0.00";

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh />
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Platform Health</h1>
        <p className="text-xs text-muted">
          Active users, real infrastructure load, and early-warning capacity signals. Founder/Admin only — every number below is a real measurement or explicitly marked as unavailable, never fabricated.
        </p>
      </div>

      <div className="rounded-sm border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-mono font-semibold uppercase tracking-wide ${STATE_CLASS[assessment.loadState]}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
              {STATE_LABEL[assessment.loadState]}
            </span>
            <DataBadge kind="real-time" />
          </div>
        </div>
        {assessment.primaryBottleneck ? (
          <p className="mt-2 text-xs text-foreground">
            <span className="font-semibold">Primary bottleneck: {assessment.primaryBottleneck}.</span> {assessment.bottleneckReason}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted">No active bottleneck signal — DB latency and error rate are within normal range.</p>
        )}
      </div>

      <section>
        <h2 className="mb-2 font-mono text-sm font-semibold text-foreground">Active users</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">Active now (2 min)</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{activeCounts.activeNow.toLocaleString("en-IN")}</p>
            <p className="mt-1 text-[11px] text-muted">
              {activeCounts.anonymousActiveNow.toLocaleString("en-IN")} anonymous · {activeCounts.registeredActiveNow.toLocaleString("en-IN")} registered
            </p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">Last 5 minutes</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{activeCounts.active5m.toLocaleString("en-IN")}</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">Last 30 minutes</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{activeCounts.active30m.toLocaleString("en-IN")}</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">Today</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{activeCounts.activeToday.toLocaleString("en-IN")}</p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-mono text-sm font-semibold text-foreground">System load</h2>
          <DataBadge kind="instance-sampled" />
        </div>
        <p className="mb-2 text-[11px] text-muted">
          Database timings are sampled in-process from every Prisma query this serverless instance has handled since its last cold start or the last hourly snapshot — real numbers, not a fleet-wide aggregate (this app has no APM/observability vendor wired up).
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">Avg DB response time</p>
            <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">{db.avgMs !== null ? `${db.avgMs}ms` : "--"}</p>
            <p className="mt-1 text-[11px] text-muted">{db.sampleCount} samples this window</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">P95 DB response time</p>
            <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">{db.p95Ms !== null ? `${db.p95Ms}ms` : "--"}</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">P99 DB response time</p>
            <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">{db.p99Ms !== null ? `${db.p99Ms}ms` : "--"}</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">DB error rate</p>
            <p className={`mt-1.5 font-mono text-xl font-semibold ${db.errorCount > 0 ? "text-negative" : "text-foreground"}`}>{errorRatePercent}%</p>
            <p className="mt-1 text-[11px] text-muted">{db.errorCount} errors / {db.totalCount} queries</p>
          </div>
        </div>
        <p className="mt-3 text-[10px] text-muted">
          Full HTTP request-rate/API-latency instrumentation (all traffic, not just DB queries) would require Vercel Observability API access or a dedicated APM — not configured in this project. Site traffic volume below is a real, counted proxy (tracked page/search/heartbeat activity), not raw server request logs.
        </p>
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Capacity</h2>
        <p className="text-xs font-mono font-semibold uppercase tracking-wide text-warning">Capacity baseline not established</p>
        <p className="mt-1 text-xs text-muted">
          No controlled load test has been run against this platform. &ldquo;Safe operating capacity&rdquo; cannot be honestly stated as a number without one — run a controlled load test (staging, progressively increasing concurrent users) to establish a reliable capacity baseline. See Part 14 of the Platform Capacity spec; this requires your explicit go-ahead since it touches infrastructure beyond this app.
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-mono text-sm font-semibold text-foreground">Peak traffic (active users)</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ["Today", peaks.today],
            ["Last 7 days", peaks.last7d],
            ["Last 30 days", peaks.last30d],
            ["Last 90 days", peaks.last90d],
          ] as const).map(([label, p]) => (
            <div key={label} className="rounded-sm border border-border bg-surface p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
              <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">{p.activeNow.toLocaleString("en-IN")}</p>
              <p className="mt-1 text-[11px] text-muted">{p.capturedAt ? formatDateTime(p.capturedAt) : "No data yet"}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Active-user growth trend</h2>
        {growth.sufficientData ? (
          <div className="mt-2 flex flex-wrap gap-6 text-xs">
            <div><p className="text-muted">30 days ago (peak)</p><p className="font-mono text-base text-foreground">{growth.peakThirtyDaysAgo}</p></div>
            <div><p className="text-muted">Today (peak)</p><p className="font-mono text-base text-foreground">{growth.peakToday}</p></div>
            <div><p className="text-muted">Growth</p><p className="font-mono text-base text-foreground">{growth.growthPercent !== null ? `${growth.growthPercent >= 0 ? "+" : ""}${growth.growthPercent}%` : "--"}</p></div>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted">
            Insufficient data — {growth.coverageDays} day{growth.coverageDays === 1 ? "" : "s"} of snapshot history collected so far. Needs 30 days before a trend can be shown honestly.
          </p>
        )}
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-sm font-semibold text-foreground">72-hour history</h2>
          <DataBadge kind="instance-sampled" />
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-muted">No snapshots yet — the first is captured by the platform-metrics cron&apos;s next hourly run.</p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-border">
            <table className="w-full min-w-[680px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium text-right">Active users</th>
                  <th className="px-3 py-2 font-medium text-right">Activity/hr</th>
                  <th className="px-3 py-2 font-medium text-right">Avg DB</th>
                  <th className="px-3 py-2 font-medium text-right">P95 DB</th>
                  <th className="px-3 py-2 font-medium text-right">DB errors</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium">Bottleneck</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((point) => (
                  <tr key={point.capturedAt.toISOString()} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 font-mono text-foreground">{formatDateTime(point.capturedAt)}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{point.activeNow}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{point.activityEventCount}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{point.dbAvgResponseMs !== null ? `${Math.round(point.dbAvgResponseMs)}ms` : "--"}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{point.dbP95ResponseMs !== null ? `${Math.round(point.dbP95ResponseMs)}ms` : "--"}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{point.dbErrorCount}/{point.dbSampleCount}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-mono uppercase ${STATE_CLASS[point.loadState]}`}>{point.loadState}</span>
                    </td>
                    <td className="px-3 py-2 text-muted">{point.primaryBottleneck ?? "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Alert history</h2>
        {alerts.length === 0 ? (
          <p className="text-xs text-muted">No capacity alerts yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {alerts.map((alert) => (
              <li key={alert.id} className="border-b border-border pb-2 text-xs last:border-b-0">
                <p className="font-mono text-[10px] uppercase tracking-wide text-muted">{formatDateTime(alert.createdAt)}</p>
                <p className="font-semibold text-foreground">{alert.title}</p>
                <p className="text-muted">{alert.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
