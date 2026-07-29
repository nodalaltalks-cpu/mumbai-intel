import { formatDate } from "@/lib/format";
import type { EntityBrochureStats } from "@/lib/analytics/brochure-queries";

/** Internal-only brochure download stats — shared by the Project/Builder/Locality admin edit pages. */
export default function BrochureStatsCard({ title, stats }: { title: string; stats: EntityBrochureStats }) {
  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Total Downloads</p>
          <p className="mt-1 font-mono text-lg text-foreground">{stats.totalDownloads}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Last Download</p>
          <p className="mt-1 font-mono text-lg text-foreground">{stats.lastDownloadAt ? formatDate(stats.lastDownloadAt) : "--"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Last 7 Days</p>
          <p className="mt-1 font-mono text-lg text-foreground">{stats.downloadsLast7Days}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Last 30 Days</p>
          <p className="mt-1 font-mono text-lg text-foreground">{stats.downloadsLast30Days}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">This Month</p>
          <p className="mt-1 font-mono text-lg text-foreground">{stats.downloadsThisMonth}</p>
        </div>
      </div>
    </div>
  );
}
