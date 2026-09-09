import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth/guard";
import { getResearchActivityFeed, humanizeFieldKey } from "@/lib/enrichment/researchActivityFeed";
import { formatDateTime } from "@/lib/format";
import type { ResearchFieldStatus } from "@/lib/enrichment/researchAttribution";

export const metadata: Metadata = { title: "Research Activity — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

/**
 * Data Sync Control Center fix — the compact, cross-project "Research
 * Activity" feed (Problem 1). Purely a flattened read of the SAME AuditLog-
 * derived research attribution the Review Queue's per-project badge and
 * "View Research Changes" dialog already use (see
 * lib/enrichment/researchActivityFeed.ts) — no new table, no analytics
 * system, no mutation of any kind on this page.
 */

type FeedFilter = "all" | ResearchFieldStatus;
const FILTERS: FeedFilter[] = ["all", "ACCEPTED", "FOUNDER_EDITED", "REJECTED", "CONFLICT", "PENDING"];
const FILTER_LABEL: Record<FeedFilter, string> = {
  all: "All",
  ACCEPTED: "Accepted",
  FOUNDER_EDITED: "Edited",
  REJECTED: "Rejected",
  CONFLICT: "Conflict",
  PENDING: "Pending Review",
};

export default async function ResearchActivityPage({ searchParams }: { searchParams: Promise<{ status?: string; search?: string }> }) {
  await requireAdminSession();
  const params = await searchParams;
  const filter: FeedFilter = (FILTERS as string[]).includes(params.status ?? "") ? (params.status as FeedFilter) : "all";
  const search = (params.search ?? "").trim().toLowerCase();

  const allRows = await getResearchActivityFeed();
  const searched = search
    ? allRows.filter((r) =>
        [r.projectName, r.developerName, r.reraNumber, r.fieldKey]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(search))
      )
    : allRows;
  const rows = filter === "all" ? searched : searched.filter((r) => r.status === filter);

  function buildHref(targetFilter: FeedFilter) {
    const qs = new URLSearchParams();
    if (targetFilter !== "all") qs.set("status", targetFilter);
    if (search) qs.set("search", search);
    const qsString = qs.toString();
    return qsString ? `/admin/data-sync/research-activity?${qsString}` : "/admin/data-sync/research-activity";
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Research Activity</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Every field a research pass (Claude + Chrome, or a future automated agent) actually proposed for a currently-pending project, and what happened
          to it. Read-only — accept/edit/reject still happens in each project&apos;s own Review Queue card.
        </p>
        <p className="mt-2 font-mono text-xs text-muted">{allRows.length} finding{allRows.length === 1 ? "" : "s"} across all pending projects</p>
      </div>

      <form method="get" className="flex items-center gap-2">
        {filter !== "all" ? <input type="hidden" name="status" value={filter} /> : null}
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Search project, developer, RERA, field..."
          className="w-full max-w-md rounded-sm border border-border bg-surface px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button type="submit" className="rounded-sm border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
          Search
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <a
            key={f}
            href={buildHref(f)}
            className={`rounded-sm border px-3 py-1.5 text-xs font-mono uppercase tracking-wide ${
              f === filter ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {FILTER_LABEL[f]}
          </a>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-sm border border-border p-4 text-xs text-muted">No research activity matches this filter.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Field</th>
                <th className="px-3 py-2">Research result</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={`${r.stagingRecordId}:${r.fieldKey}:${i}`}>
                  <td className="max-w-[220px] px-3 py-2 align-top">
                    <p className="font-mono text-foreground">{r.projectName}</p>
                    <p className="text-[10px] text-muted">{[r.developerName, r.localityName].filter(Boolean).join(" · ")}</p>
                  </td>
                  <td className="px-3 py-2 align-top text-foreground">{humanizeFieldKey(r.fieldKey)}</td>
                  <td className="max-w-[280px] break-words px-3 py-2 align-top text-muted">{r.proposedValue ?? "—"}</td>
                  <td className="px-3 py-2 align-top text-foreground">{FILTER_LABEL[r.status]}</td>
                  <td className="max-w-[200px] truncate px-3 py-2 align-top text-muted">
                    {r.sourceUrl ? (
                      <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-accent hover:underline">
                        {r.sourceUrl}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-[10px] text-muted">
                    {formatDateTime(r.decidedAt ?? r.proposedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
