import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth/guard";
import { getLivePlatformStatus, getPlatformMetricHistory, getPeakTraffic, getCapacityGrowthTrend, computeDbLatencyTrend, checkRegionAlignment } from "@/lib/platform-metrics/queries";
import { getPlatformAlertHistory } from "@/lib/platform-metrics/alerts";
import { getCapacityBaseline } from "@/lib/platform-metrics/capacity-baseline";
import { computeScalabilityReadiness, getRecommendedActions, type ReadinessStatus } from "@/lib/platform-metrics/advisory";
import { getRankingMode } from "@/lib/recommendations/ml/mode";
import { formatDateTime } from "@/lib/format";
import type { PlatformLoadState } from "@prisma/client";
import LastUpdated from "./LastUpdated";
import CapacityBaselineForm from "@/app/admin/components/CapacityBaselineForm";

export const metadata: Metadata = { title: "Platform Health — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const STATE_CLASS: Record<PlatformLoadState, string> = {
  NORMAL: "border-positive/40 bg-positive/10 text-positive",
  WATCH: "border-info/40 bg-info/10 text-info",
  WARNING: "border-warning/40 bg-warning/10 text-warning",
  CRITICAL: "border-negative/40 bg-negative/10 text-negative",
};

// Part A — 🟢/🟡/🔴 three-state as the spec asks, mapped from the existing 4-state internal model (WATCH/WARNING both read as "degraded" at this level — the detail sections below still show the full 4-state granularity).
const SIMPLE_STATUS: Record<PlatformLoadState, { icon: string; label: string; class: string }> = {
  NORMAL: { icon: "🟢", label: "HEALTHY", class: "text-positive" },
  WATCH: { icon: "🟡", label: "DEGRADED", class: "text-warning" },
  WARNING: { icon: "🟡", label: "DEGRADED", class: "text-warning" },
  CRITICAL: { icon: "🔴", label: "CRITICAL", class: "text-negative" },
};

const READINESS_ICON: Record<ReadinessStatus, string> = { HEALTHY: "🟢", NEEDS_OPTIMIZATION: "🟡", DORMANT: "⚪", UNKNOWN: "⚪" };
const READINESS_LABEL: Record<ReadinessStatus, string> = { HEALTHY: "Healthy", NEEDS_OPTIMIZATION: "Needs optimization", DORMANT: "Dormant", UNKNOWN: "Unknown" };

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
  // ADMIN only — Part 6: employees must not automatically get infrastructure visibility.
  await requireAdminSession();

  const [{ activeCounts, db, assessment }, history, peaks, growth, alerts, capacityBaseline, rankingMode] = await Promise.all([
    getLivePlatformStatus(),
    getPlatformMetricHistory(),
    getPeakTraffic(),
    getCapacityGrowthTrend(),
    getPlatformAlertHistory(20),
    getCapacityBaseline(),
    getRankingMode(),
  ]);

  const region = checkRegionAlignment();
  const dbTrend = computeDbLatencyTrend(history);
  const readiness = computeScalabilityReadiness({ region, db, loadState: assessment.loadState, mlStatus: rankingMode });
  const actions = getRecommendedActions({ region, db, loadState: assessment.loadState, capacityBaseline });

  const errorRatePercent = db.totalCount > 0 ? ((db.errorCount / db.totalCount) * 100).toFixed(2) : "0.00";
  const simple = SIMPLE_STATUS[assessment.loadState];
  const todayTestedAtDefault = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Platform Health</h1>
          <p className="text-xs text-muted">
            Active users, real infrastructure load, and early-warning capacity signals. Founder/Admin only — every number below is a real measurement or explicitly marked as unavailable, never fabricated.
          </p>
        </div>
        <LastUpdated />
      </div>

      {/* A. PLATFORM STATUS */}
      <div className="rounded-sm border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-sm font-mono font-semibold uppercase tracking-wide ${STATE_CLASS[assessment.loadState]}`}>
              {simple.icon} {simple.label}
            </span>
            <span className="text-[10px] text-muted">({assessment.loadState})</span>
            <DataBadge kind="real-time" />
          </div>
        </div>
        {assessment.primaryBottleneck ? (
          <p className="mt-2 text-xs text-foreground">
            <span className="font-semibold">Primary bottleneck: {assessment.primaryBottleneck}.</span> {assessment.bottleneckReason}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted">No active bottleneck signal — DB latency, timeouts, and error rate are within normal range.</p>
        )}
      </div>

      {/* B. USERS RIGHT NOW */}
      <section>
        <h2 className="mb-2 font-mono text-sm font-semibold text-foreground">Users right now</h2>
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
            <p className="text-[10px] uppercase tracking-wide text-muted">Today (unique)</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{activeCounts.activeToday.toLocaleString("en-IN")}</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted">Peak active users today: <span className="font-mono text-foreground">{peaks.today.activeNow}</span>{peaks.today.capturedAt ? ` at ${formatDateTime(peaks.today.capturedAt)}` : ""}</p>
      </section>

      {/* C. DATABASE HEALTH */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-mono text-sm font-semibold text-foreground">Database health</h2>
          <DataBadge kind="instance-sampled" />
        </div>
        <p className="mb-2 text-[11px] text-muted">
          Sampled in-process from every Prisma query this instance has handled since its last cold start or daily snapshot — real numbers, not a fleet-wide aggregate.
          Trend: <span className="font-semibold text-foreground">{dbTrend === "UNKNOWN" ? "Not enough history yet" : dbTrend.charAt(0) + dbTrend.slice(1).toLowerCase()}</span>
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">P95 / P99 latency</p>
            <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">{db.p95Ms !== null ? `${db.p95Ms}ms` : "--"} <span className="text-sm text-muted">/ {db.p99Ms !== null ? `${db.p99Ms}ms` : "--"}</span></p>
            <p className="mt-1 text-[11px] text-muted">Avg {db.avgMs !== null ? `${db.avgMs}ms` : "--"} · {db.sampleCount} samples</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">Connection timeouts</p>
            <p className={`mt-1.5 font-mono text-xl font-semibold ${db.timeoutCount > 0 ? "text-negative" : "text-foreground"}`}>{db.timeoutCount}</p>
            <p className="mt-1 text-[11px] text-muted">Same failure mode as the Phase 2 load test at 50 concurrent</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">DB error rate</p>
            <p className={`mt-1.5 font-mono text-xl font-semibold ${db.errorCount > 0 ? "text-negative" : "text-foreground"}`}>{errorRatePercent}%</p>
            <p className="mt-1 text-[11px] text-muted">{db.errorCount} errors / {db.totalCount} queries</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">Region alignment</p>
            <p className={`mt-1.5 font-mono text-sm font-semibold ${region.mismatched === true ? "text-negative" : region.mismatched === false ? "text-positive" : "text-muted"}`}>
              {region.mismatched === null ? "Unknown (local)" : region.mismatched ? "MISMATCHED" : "Aligned"}
            </p>
            <p className="mt-1 text-[11px] text-muted">Vercel: {region.vercelRegion ?? "n/a"} · Neon: {region.neonRegion ?? "n/a"}</p>
          </div>
        </div>
      </section>

      {/* D. APPLICATION PERFORMANCE */}
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Application performance</h2>
        <p className="text-xs text-muted">
          Full request-level latency/error-rate (application processing distinct from DB/external latency) is <span className="font-semibold text-foreground">Not currently measured</span> — this app has no APM/Observability vendor wired up.
          Database latency above is the one component that IS measured. Site traffic volume is tracked as a real activity-event proxy (see history table below), not raw HTTP request logs.
        </p>
      </section>

      {/* E/F. CAPACITY INDICATOR + WARNING SYSTEM */}
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Capacity status</h2>
        <div className="mt-2 flex flex-wrap items-center gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Current load</p>
            <p className="font-mono text-lg text-foreground">{activeCounts.activeNow} active users</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Platform health</p>
            <p className={`font-mono text-lg font-semibold ${simple.class}`}>{simple.icon} {simple.label}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Capacity status</p>
            <p className="font-mono text-lg text-foreground">
              {capacityBaseline.highestTestedConcurrency ? (assessment.loadState === "NORMAL" ? "Normal" : "🟡 Approaching measured threshold") : "Capacity baseline establishing"}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted">
          Warning thresholds (Part F) are based on measured DB latency degradation and connection timeouts (see lib/platform-metrics/snapshot.ts) — not an active-user count, since no reliable active-user-to-load mapping exists yet (only concurrent HTTP requests have been load-tested, a different unit — see Capacity Baseline below).
        </p>
      </section>

      {/* G. Warning banner is rendered platform-wide via PlatformCapacityWarningBanner (app/admin layout) — Alert History below is its permanent record. */}

      {/* I. CAPACITY BASELINE */}
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Capacity baseline</h2>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Current observed load</p>
            <p className="font-mono text-base text-foreground">{activeCounts.activeNow} active users</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Highest tested (concurrent requests)</p>
            <p className="font-mono text-base text-foreground">{capacityBaseline.highestTestedConcurrency ?? "Not yet tested"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Production verification</p>
            <p className="font-mono text-base text-foreground">{capacityBaseline.confidence === "HIGH" ? "Completed" : "Not yet completed"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Confidence</p>
            <p className="font-mono text-base text-foreground">{capacityBaseline.confidence ?? "UNKNOWN"}</p>
          </div>
        </div>
        {capacityBaseline.notes ? <p className="mt-2 text-[11px] text-muted">{capacityBaseline.notes}</p> : null}
        <p className="mt-2 text-[10px] text-muted">
          &ldquo;Highest tested&rdquo; is concurrent HTTP requests in a synthetic burst, not concurrent active users — these are related but not the same number, and treating them as equal would be exactly the fabricated-capacity problem this page exists to avoid.
        </p>
        <CapacityBaselineForm
          defaultConcurrency={capacityBaseline.highestTestedConcurrency}
          defaultTestedAt={capacityBaseline.testedAt ? capacityBaseline.testedAt.toISOString().slice(0, 10) : todayTestedAtDefault}
          defaultConfidence={capacityBaseline.confidence ?? "MEDIUM"}
          defaultNotes={capacityBaseline.notes ?? ""}
        />
      </section>

      {/* J. SCALABILITY READINESS */}
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Scalability readiness</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {([
            ["Database", readiness.database],
            ["Application", readiness.application],
            ["Recommendation engine", readiness.recommendationEngine],
            ["Analytics", readiness.analytics],
            ["ML", readiness.ml],
            ["Monitoring", readiness.monitoring],
          ] as const).map(([label, status]) => (
            <div key={label}>
              <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
              <p className="font-mono text-sm text-foreground">{READINESS_ICON[status]} {READINESS_LABEL[status]}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted">{readiness.databaseReason}</p>
      </section>

      {/* K. WHAT SHOULD I DO */}
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Next recommended action</h2>
        <ol className="flex flex-col gap-2 text-xs">
          {actions.map((action, i) => (
            <li key={action.label} className="border-b border-border pb-2 last:border-b-0">
              <p className="font-semibold text-foreground">{i + 1}. {action.label}</p>
              <p className="mt-0.5 text-muted">{action.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* H. PLATFORM HEALTH HISTORY */}
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
          <h2 className="font-mono text-sm font-semibold text-foreground">History (one snapshot/day — Vercel Hobby plan cron limit)</h2>
          <DataBadge kind="instance-sampled" />
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-muted">No snapshots yet — the first is captured by the platform-metrics cron&apos;s next daily run (8:00 AM UTC).</p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-border">
            <table className="w-full min-w-[760px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium text-right">Active users</th>
                  <th className="px-3 py-2 font-medium text-right">Activity</th>
                  <th className="px-3 py-2 font-medium text-right">Avg DB</th>
                  <th className="px-3 py-2 font-medium text-right">P95 DB</th>
                  <th className="px-3 py-2 font-medium text-right">DB errors</th>
                  <th className="px-3 py-2 font-medium text-right">Timeouts</th>
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
                    <td className={`px-3 py-2 text-right font-mono ${point.dbTimeoutCount > 0 ? "text-negative" : "text-muted"}`}>{point.dbTimeoutCount}</td>
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
