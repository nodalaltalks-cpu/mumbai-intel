import Link from "next/link";
import { getLivePlatformStatus } from "@/lib/platform-metrics/queries";
import type { PlatformLoadState } from "@prisma/client";

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

/** Part 22 — compact Founder-only card, visible on the main dashboard without opening the detailed Platform Health page. */
export default async function PlatformHealthSummaryCard() {
  const { activeCounts, db, assessment } = await getLivePlatformStatus();
  const errorRatePercent = db.totalCount > 0 ? ((db.errorCount / db.totalCount) * 100).toFixed(1) : "0.0";

  return (
    <Link
      href="/admin/platform-health"
      className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4 transition-colors hover:border-accent/50 hover:bg-surface-raised"
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-muted">Platform Health</p>
        <span className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide ${STATE_CLASS[assessment.loadState]}`}>
          <span className="h-1 w-1 rounded-full bg-current" aria-hidden="true" />
          {STATE_LABEL[assessment.loadState]}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-[10px] text-muted">Active now</p>
          <p className="font-mono text-base font-semibold text-foreground">{activeCounts.activeNow.toLocaleString("en-IN")}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted">Avg DB</p>
          <p className="font-mono text-base font-semibold text-foreground">{db.avgMs !== null ? `${db.avgMs}ms` : "--"}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted">Error rate</p>
          <p className="font-mono text-base font-semibold text-foreground">{errorRatePercent}%</p>
        </div>
      </div>
      <p className="text-[10px] text-accent">View Platform Health &rarr;</p>
    </Link>
  );
}
