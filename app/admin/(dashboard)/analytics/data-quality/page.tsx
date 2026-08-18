import Link from "next/link";
import type { Metadata } from "next";
import {
  getDataQualitySummary,
  getDuplicateCandidates,
  getLowestCompletionProjects,
  getProjectsWithoutTransactions,
  getStalestProjects,
  type DataQualityProjectRow,
} from "@/lib/analytics/data-quality-queries";
import { formatRelativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Data Quality — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

function completionClass(pct: number): string {
  if (pct >= 80) return "border-positive/40 bg-positive/10 text-positive";
  if (pct >= 50) return "border-accent/40 bg-accent/10 text-accent";
  return "border-negative/40 bg-negative/10 text-negative";
}

function ProjectRowList({ title, subtitle, items, emptyLabel }: { title: string; subtitle: string; items: DataQualityProjectRow[]; emptyLabel: string }) {
  return (
    <section className="rounded-sm border border-border bg-surface p-4">
      <h2 className="font-mono text-sm font-semibold text-foreground">{title}</h2>
      <p className="mb-3 text-[11px] text-muted">{subtitle}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
              <div className="min-w-0">
                <Link href={`/admin/projects/${p.id}/edit`} className="block truncate text-xs text-foreground hover:text-accent">
                  {p.name}
                </Link>
                <p className="text-[10px] text-muted">{p.localityName} · updated {formatRelativeTime(p.updatedAt)}</p>
              </div>
              <span className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-mono ${completionClass(p.completionPercent)}`}>
                {p.completionPercent}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function DataQualityPage() {
  const [summary, lowestCompletion, stalest, noTransactions, duplicates] = await Promise.all([
    getDataQualitySummary(),
    getLowestCompletionProjects(10),
    getStalestProjects(10),
    getProjectsWithoutTransactions(10),
    getDuplicateCandidates(10),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Data Quality</h1>
        <p className="text-xs text-muted">
          Where the platform&apos;s intelligence is weak — scoped to published, live projects only (a draft is expected to be
          incomplete). Completion % is the same section-weighted score shown on each project&apos;s own edit form, not a new
          metric invented for this page.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Live Projects", summary.totalLiveProjects],
          ["Avg Completion", `${summary.averageCompletionPercent}%`],
          [`Stale (${summary.staleAfterDays}d+)`, summary.staleCount],
          ["No Transactions", summary.noTransactionsCount],
          ["Missing Docs", summary.missingDocsCount],
          ["Low Confidence", summary.lowConfidenceCount],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ProjectRowList
          title="Lowest completion"
          subtitle="Worst-scored live projects — click through to see exactly which section is incomplete."
          items={lowestCompletion}
          emptyLabel="Every live project is fully complete."
        />
        <ProjectRowList
          title="Stalest data"
          subtitle={`Not touched in ${summary.staleAfterDays}+ days — likely to be out of date.`}
          items={stalest}
          emptyLabel="No live project has gone stale."
        />
        <ProjectRowList
          title="No transaction history"
          subtitle="Live projects with zero linked transactions — price/demand context is missing."
          items={noTransactions}
          emptyLabel="Every live project has at least one transaction on record."
        />

        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="font-mono text-sm font-semibold text-foreground">Duplicate candidates</h2>
          <p className="mb-3 text-[11px] text-muted">Exact same name + locality — a fuzzy/near-duplicate matcher is future scope, not this.</p>
          {duplicates.length === 0 ? (
            <p className="text-xs text-muted">No exact name+locality collisions found.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {duplicates.map((group) => (
                <li key={`${group.name}-${group.localityName}`} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <p className="text-xs font-semibold text-foreground">
                    {group.name} <span className="font-normal text-muted">— {group.localityName}</span>
                  </p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {group.projects.map((p) => (
                      <li key={p.id} className="flex items-center justify-between text-[11px] text-muted">
                        <Link href={`/admin/projects/${p.id}/edit`} className="hover:text-accent">
                          {p.id}
                        </Link>
                        <span>
                          {p.completionPercent}% · updated {formatRelativeTime(p.updatedAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
