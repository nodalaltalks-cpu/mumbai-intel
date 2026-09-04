"use client";

import { useMemo, useState } from "react";
import FormTabs, { type FormTab } from "./FormTabs";
import DiscoveryCandidateList, { type DiscoveryCandidateRow } from "./DiscoveryCandidateList";
import type { BuilderForWebsiteLookup } from "@/lib/enrichment/developerWebsite";
import type { DiscoveryFounderAction } from "@/lib/ingestion/discovery/statusTransitions";
import type { DiscoveryStatus } from "@/lib/ingestion/discovery/types";
import type { DiscoveryCandidateEditInput } from "@/lib/actions/discovery";
import EmptyState from "@/app/components/ui/EmptyState";

/**
 * Phase 68 — founder triage UI for the Discovery Queue. Deliberately a pure
 * client-side VIEW over the exact same `DiscoveryCandidateRow[]` the page
 * already fetches (no new query, no new database field, no change to
 * DiscoveryCandidateList's own columns/actions/behaviour) — every filter here
 * is a derived read of fields that already exist on the row:
 * `status` (DiscoveryStatus), `liveDuplicateStatus`, and the payload's
 * `sourceType`/`discoverySource`/`developerName`/`areaName`/`batchLabel`.
 *
 * TRIAGE BUCKET mapping (one bucket per row, used for both the status tabs
 * and the summary counts — see getTriageBucket below for the exact,
 * mutually-exclusive precedence):
 *   EXCLUDED      status === "EXCLUDED" (a founder's own decision)
 *   DUPLICATE     status === "REJECTED_DUPLICATE" (system-decided, already resolved)
 *   INCLUDED      status is PROJECT_STAGED / READY_FOR_ENRICHMENT / ENRICHED
 *   UNRESOLVED    still open (DISCOVERED/SOURCE_FOUND/NEEDS_REVIEW) AND its
 *                 live duplicate re-check came back null -- which
 *                 liveDuplicateStatus.ts's own resolveLiveDuplicateStatus only
 *                 ever does when the candidate's own areaName text does NOT
 *                 currently resolve to a single real Locality (Phase 68's own
 *                 "unresolved location" investigation was exactly this signal)
 *   NEEDS_REVIEW  still open, locality resolves fine, status === "NEEDS_REVIEW"
 *   NEW           still open, locality resolves fine, not flagged for review
 *                 (DISCOVERED/SOURCE_FOUND -- a genuinely fresh candidate)
 */
export type TriageBucket = "NEEDS_REVIEW" | "NEW" | "INCLUDED" | "EXCLUDED" | "DUPLICATE" | "UNRESOLVED";
type StatusFilter = TriageBucket | "ALL";
type SourceBucket = "DEVELOPER_WEBSITE" | "HOUSIEY" | "OTHER_THIRD_PARTY";
type SourceFilter = SourceBucket | "ALL";

const INCLUDED_STATUSES: ReadonlySet<DiscoveryStatus> = new Set(["PROJECT_STAGED", "READY_FOR_ENRICHMENT", "ENRICHED"]);

export function getTriageBucket(row: DiscoveryCandidateRow): TriageBucket {
  if (row.status === "EXCLUDED") return "EXCLUDED";
  if (row.status === "REJECTED_DUPLICATE") return "DUPLICATE";
  if (INCLUDED_STATUSES.has(row.status)) return "INCLUDED";
  if (row.liveDuplicateStatus === null) return "UNRESOLVED";
  if (row.status === "NEEDS_REVIEW") return "NEEDS_REVIEW";
  return "NEW";
}

/** Housiey checked first — it's the one VERIFIED_THIRD_PARTY source that exists today, but this keeps the bucket correct even if `sourceType` alone were ever ambiguous, without introducing any new source model. */
function getSourceBucket(row: DiscoveryCandidateRow): SourceBucket {
  if (row.payload.discoverySource.toLowerCase().includes("housiey")) return "HOUSIEY";
  if (row.payload.sourceType === "OFFICIAL_DEVELOPER") return "DEVELOPER_WEBSITE";
  return "OTHER_THIRD_PARTY";
}

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "NEEDS_REVIEW", label: "Needs Review" },
  { id: "NEW", label: "New Candidates" },
  { id: "INCLUDED", label: "Included / Staged" },
  { id: "EXCLUDED", label: "Excluded" },
  { id: "DUPLICATE", label: "Duplicate" },
  { id: "UNRESOLVED", label: "Unresolved" },
];

const SOURCE_TABS: { id: SourceFilter; label: string }[] = [
  { id: "ALL", label: "All Sources" },
  { id: "DEVELOPER_WEBSITE", label: "Developer Website" },
  { id: "HOUSIEY", label: "Housiey" },
  { id: "OTHER_THIRD_PARTY", label: "Other / Third Party" },
];

const ALL_OPTION = "ALL";
const selectClass =
  "rounded-sm border border-border bg-surface px-2 py-1 text-[11px] text-foreground focus:border-accent focus:outline-none";

export default function DiscoveryTriagePanel({
  rows,
  onAction,
  onEdit,
  builders,
}: {
  rows: DiscoveryCandidateRow[];
  onAction: (id: string, action: DiscoveryFounderAction) => Promise<{ ok: boolean; error?: string; projectStagingRecordId?: string }>;
  onEdit: (id: string, edits: DiscoveryCandidateEditInput) => Promise<{ ok: boolean; error?: string }>;
  /** Phase 71 — the existing Builder registry, passed through unchanged so the edit panel can look up a developer's saved website LIVE as the founder types/selects, not just from whatever developerName the candidate happened to be staged with. */
  builders: BuilderForWebsiteLookup[];
}) {
  // Requirement 2 — "Needs Review" is the founder's default landing view.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("NEEDS_REVIEW");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
  const [localityQuery, setLocalityQuery] = useState("");
  const [developerFilter, setDeveloperFilter] = useState(ALL_OPTION);
  const [runFilter, setRunFilter] = useState(ALL_OPTION);

  const developerOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.payload.developerName))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  /** Most-recently-active run first, derived purely from the already-fetched createdAt/batchLabel fields (ISO strings sort lexically). */
  const runOptions = useMemo(() => {
    const latestByLabel = new Map<string, string>();
    for (const r of rows) {
      const label = r.payload.batchLabel;
      const prev = latestByLabel.get(label);
      if (!prev || r.createdAt > prev) latestByLabel.set(label, r.createdAt);
    }
    return Array.from(latestByLabel.entries())
      .sort((a, b) => (a[1] < b[1] ? 1 : -1))
      .map(([label]) => label);
  }, [rows]);

  const matchesSecondaryFilters = (row: DiscoveryCandidateRow) => {
    if (sourceFilter !== "ALL" && getSourceBucket(row) !== sourceFilter) return false;
    if (developerFilter !== ALL_OPTION && row.payload.developerName !== developerFilter) return false;
    if (runFilter !== ALL_OPTION && row.payload.batchLabel !== runFilter) return false;
    if (localityQuery.trim() && !row.payload.areaName.toLowerCase().includes(localityQuery.trim().toLowerCase())) return false;
    return true;
  };

  const rowsMatchingSecondaryFilters = useMemo(
    () => rows.filter(matchesSecondaryFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sourceFilter, developerFilter, runFilter, localityQuery]
  );

  const statusCounts = useMemo(() => {
    const counts: Record<TriageBucket, number> = { NEEDS_REVIEW: 0, NEW: 0, INCLUDED: 0, EXCLUDED: 0, DUPLICATE: 0, UNRESOLVED: 0 };
    for (const row of rowsMatchingSecondaryFilters) counts[getTriageBucket(row)] += 1;
    return counts;
  }, [rowsMatchingSecondaryFilters]);

  const visibleRows = useMemo(
    () => (statusFilter === "ALL" ? rowsMatchingSecondaryFilters : rowsMatchingSecondaryFilters.filter((r) => getTriageBucket(r) === statusFilter)),
    [rowsMatchingSecondaryFilters, statusFilter]
  );

  // Requirement 5 — a compact, filter-independent backlog overview (always the FULL candidate set, so the founder
  // sees the true overall backlog even while narrowed into one source/locality/run).
  const globalCounts = useMemo(() => {
    const counts: Record<TriageBucket, number> = { NEEDS_REVIEW: 0, NEW: 0, INCLUDED: 0, EXCLUDED: 0, DUPLICATE: 0, UNRESOLVED: 0 };
    for (const row of rows) counts[getTriageBucket(row)] += 1;
    return counts;
  }, [rows]);

  const statusTabs: FormTab[] = STATUS_TABS.map((tab) => ({
    id: tab.id,
    label: tab.id === "ALL" ? `${tab.label} (${rowsMatchingSecondaryFilters.length})` : `${tab.label} (${statusCounts[tab.id]})`,
  }));
  const sourceTabs: FormTab[] = SOURCE_TABS.map((tab) => ({ id: tab.id, label: tab.label }));

  const hasActiveFilters = statusFilter !== "ALL" || sourceFilter !== "ALL" || developerFilter !== ALL_OPTION || runFilter !== ALL_OPTION || localityQuery.trim() !== "";

  function clearFilters() {
    setStatusFilter("ALL");
    setSourceFilter("ALL");
    setLocalityQuery("");
    setDeveloperFilter(ALL_OPTION);
    setRunFilter(ALL_OPTION);
  }

  const activeFilterDescriptions: string[] = [];
  if (statusFilter !== "ALL") activeFilterDescriptions.push(STATUS_TABS.find((t) => t.id === statusFilter)!.label);
  if (sourceFilter !== "ALL") activeFilterDescriptions.push(SOURCE_TABS.find((t) => t.id === sourceFilter)!.label);
  if (developerFilter !== ALL_OPTION) activeFilterDescriptions.push(`Developer: ${developerFilter}`);
  if (runFilter !== ALL_OPTION) activeFilterDescriptions.push(`Run: ${runFilter}`);
  if (localityQuery.trim()) activeFilterDescriptions.push(`Locality contains "${localityQuery.trim()}"`);

  return (
    <div className="flex flex-col gap-3">
      {/* Requirement 5 — compact backlog summary bar, unaffected by the current filter selection. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm border border-border bg-surface px-3 py-2 text-[11px] text-muted">
        <span className="font-mono uppercase tracking-wide text-[10px] text-muted">Backlog</span>
        <span><span className="font-semibold text-foreground">{globalCounts.NEEDS_REVIEW}</span> needs review</span>
        <span><span className="font-semibold text-foreground">{globalCounts.NEW}</span> new</span>
        <span><span className="font-semibold text-foreground">{globalCounts.UNRESOLVED}</span> unresolved</span>
        <span><span className="font-semibold text-foreground">{globalCounts.DUPLICATE}</span> duplicate</span>
        <span><span className="font-semibold text-foreground">{globalCounts.INCLUDED}</span> included</span>
        <span><span className="font-semibold text-foreground">{globalCounts.EXCLUDED}</span> excluded</span>
        <span className="ml-auto text-[10px]">{rows.length} total candidate{rows.length === 1 ? "" : "s"}</span>
      </div>

      <div className="flex flex-col gap-2">
        <FormTabs tabs={statusTabs} active={statusFilter} onChange={(id) => setStatusFilter(id as StatusFilter)} />
        <FormTabs tabs={sourceTabs} active={sourceFilter} onChange={(id) => setSourceFilter(id as SourceFilter)} />

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={localityQuery}
            onChange={(e) => setLocalityQuery(e.target.value)}
            placeholder="Locality / area contains…"
            className={`${selectClass} w-56`}
          />
          <select value={developerFilter} onChange={(e) => setDeveloperFilter(e.target.value)} className={selectClass}>
            <option value={ALL_OPTION}>All Developers</option>
            {developerOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select value={runFilter} onChange={(e) => setRunFilter(e.target.value)} className={selectClass}>
            <option value={ALL_OPTION}>All Discovery Runs</option>
            {runOptions.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-negative hover:text-negative"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {activeFilterDescriptions.length > 0 ? (
          <p className="text-[10px] text-muted">
            <span className="uppercase tracking-wide">Filtering:</span> {activeFilterDescriptions.join(" · ")}
          </p>
        ) : null}
      </div>

      {visibleRows.length === 0 ? (
        <EmptyState
          title="No candidates match these filters"
          message={hasActiveFilters ? "Try a different status, source, or clear all filters to see the full queue." : "No discovery candidates yet."}
        />
      ) : (
        <DiscoveryCandidateList rows={visibleRows} onAction={onAction} onEdit={onEdit} builders={builders} />
      )}
    </div>
  );
}
