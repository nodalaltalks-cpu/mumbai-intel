"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  approveStagingRecordAction,
  bulkApproveStagingRecordsAction,
  bulkRejectStagingRecordsAction,
  rejectStagingRecordAction,
} from "@/lib/actions/ingestion";
import { formatDate } from "@/lib/format";
import type { ReviewCompleteness } from "@/lib/ingestion/reviewFieldRegistry";
import type { ApprovalReadinessResult } from "@/lib/ingestion/projectApprovalReadiness";
import {
  acceptEnrichmentFieldAction,
  acceptEntityMatchAction,
  enrichProjectAction,
  getEnrichmentFieldHistoryAction,
  rejectEnrichmentFieldAction,
  rejectEntityMatchAction,
  revertEnrichmentFieldAction,
  uploadEnrichmentBrochureAction,
  uploadEnrichmentImageAction,
  type EnrichProjectResult,
  type ProjectReviewSnapshot,
  type UploadEnrichmentMediaContext,
} from "@/lib/actions/enrichment";
import type { EnrichmentField } from "@/lib/enrichment/types";
import type { EnrichmentHistoryEntry } from "@/lib/enrichment/enrichmentHistory";
import type { EnrichmentBadgeInfo } from "@/lib/enrichment/enrichmentSummary";
import { applyReviewSnapshotOverrides } from "@/lib/enrichment/reviewSnapshotOverrides";
import {
  buildResearchPlanAction,
  researchProjectAction,
  submitResearchFindingsAction,
  type ResearchPlanResult,
  type ResearchRunResult,
} from "@/lib/actions/research";
import type { ResearchFinding } from "@/lib/enrichment/researchProvider";
import type { ProjectResearchActivity } from "@/lib/enrichment/researchAttribution";
import {
  matchesAllFilters,
  normalizeSearchQuery,
  type OriginFilter,
  type ResearchStatusFilter,
  type StatusFilter,
} from "@/lib/enrichment/reviewQueueFilters";
import ConfirmButton from "./ConfirmButton";
import ReviewDataDetailsDialog from "./ReviewDataDetailsDialog";
import EnrichmentDialog from "./EnrichmentDialog";
import ResearchDialog from "./ResearchDialog";
import ResearchChangesDialog from "./ResearchChangesDialog";

export interface ReviewRecord {
  id: string;
  createdAt: string;
  sourceKey: string;
  proposedLabel: string;
  proposedTitle: string;
  proposedLines: string[];
  matchLabel: string | null;
  matchTitle: string | null;
  matchLines: string[];
  noMatchNote: string | null;
  /** Full field-by-field completeness breakdown (Phase 14C) -- null only for an entityType this hasn't been built for yet; never partially fabricated. */
  completeness: ReviewCompleteness | null;
  /** Phase 29 Part A — gates the "Enrich Project" button to Project records only. */
  isProject: boolean;
  /** Phase 34 Part F — Project-only approval-readiness verdict, derived from `completeness`; null for every non-Project record. */
  readiness: ApprovalReadinessResult | null;
  /** Phase 46 Part E — the last persisted enrichment run's at-a-glance status, read straight off the staging payload (no live fetch). Null for every non-Project record. */
  enrichmentBadge: EnrichmentBadgeInfo | null;
  /** Phase 71B — the same persisted run's fieldKey -> classification map (badge above only has counts), so the Review Queue's details dialog can name which field(s) are actually in CONFLICT. Null for every non-Project record or when enrichment has never run. */
  enrichmentOutstanding: Record<string, "GREEN_NEW" | "YELLOW" | "CONFLICT"> | null;
  /** Search + Agent Change Visibility, Part 1/2 — Project-only search/filter metadata, all derived server-side from data this page already fetched (no new query). Null for every non-Project record. */
  developerName: string | null;
  localityName: string | null;
  reraNumber: string | null;
  /** Pre-normalized (lowercase, collapsed whitespace) name+developer+locality+micro-market+RERA+address, for a simple case/spacing-insensitive `includes()` search. Null for every non-Project record (search is Project-only, matching Part 1's scope). */
  searchableText: string | null;
  /** Read-only correlation over EXISTING AuditLog rows (lib/enrichment/researchAttribution.ts) — never fabricated, never set merely because "Research Project" was clicked. Null for every non-Project record. */
  researchActivity: ProjectResearchActivity | null;
}

/** Phase 46 Part E -- the compact per-row summary. Reuses this codebase's existing plain colored-text convention (see the 🟢/🔴/🟠 completeness line just below it) rather than introducing a new visual pattern. */
function EnrichmentBadgeLine({ badge }: { badge: EnrichmentBadgeInfo }) {
  if (badge.status === "NOT_RUN") return <span className="text-[11px] text-muted">— Not run</span>;
  if (badge.status === "NO_SOURCE") return <span className="text-[11px] text-muted">— No official source found</span>;
  if (badge.status === "SOURCE_UNAVAILABLE") return <span className="text-[11px] text-warning">⚠ Source unavailable</span>;
  if (badge.status === "ERROR") return <span className="text-[11px] text-negative">⚠ Enrichment error</span>;
  if (badge.status === "NO_NEW_INFO") return <span className="text-[11px] text-muted">✓ No new information</span>;
  // READY
  if (badge.proposedCount === 0) return <span className="text-[11px] text-positive">✓ Reviewed</span>;
  return (
    <span className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className="text-accent">● {badge.proposedCount} proposed</span>
      {badge.conflictCount > 0 ? <span className="text-negative">● {badge.conflictCount} conflict{badge.conflictCount === 1 ? "" : "s"}</span> : null}
    </span>
  );
}

/**
 * Search + Agent Change Visibility, Part 5 -- the compact per-card research
 * indicator. Rendered ONLY when `activity.hasResearch` is true (real,
 * persisted proposal_created evidence exists -- see
 * lib/enrichment/researchAttribution.ts); clicking it opens the read-only
 * "Research Changes" view (Part 6), never a second review system.
 */
function ResearchBadgeLine({ activity, onOpen }: { activity: ProjectResearchActivity; onOpen: () => void }) {
  if (!activity.hasResearch) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-1 flex flex-wrap items-center gap-2 text-[11px] hover:underline"
      title="View Research Changes"
    >
      <span className="text-accent">🤖 {activity.providerLabel}</span>
      <span className="text-muted">
        {activity.passedVerification} finding{activity.passedVerification === 1 ? "" : "s"}
      </span>
      {activity.accepted > 0 ? <span className="text-positive">{activity.accepted} accepted</span> : null}
      {activity.founderEdited > 0 ? <span className="text-positive">{activity.founderEdited} edited</span> : null}
      {activity.conflicts > 0 ? <span className="text-warning">{activity.conflicts} conflict{activity.conflicts === 1 ? "" : "s"}</span> : null}
      {activity.rejected > 0 ? <span className="text-negative">{activity.rejected} rejected</span> : null}
    </button>
  );
}

interface EnrichmentViewState {
  loading: boolean;
  result: EnrichProjectResult | null;
}

export default function ReviewQueueList({ records }: { records: ReviewRecord[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [detailsRecordId, setDetailsRecordId] = useState<string | null>(null);

  // Targeted fix (real-time Review Queue synchronization) -- every
  // enrichment mutation (Accept/Edit/Reject/Undo/Enrich) now returns a fresh
  // ProjectReviewSnapshot computed straight from the payload it just wrote
  // (see lib/actions/enrichment.ts). Applying it here, keyed by staging
  // record id, updates the card's completeness/badge/readiness the INSTANT
  // the mutation resolves -- not dependent on router.refresh()'s separate,
  // slower round-trip completing (kept below as a best-effort background
  // sync for anything else on the page, never the source of truth for this
  // record's own card). Overwritten by the next mutation's snapshot for the
  // same record, so a later authoritative response always wins over an
  // earlier one -- never the other way around.
  const [snapshotOverrides, setSnapshotOverrides] = useState<Record<string, ProjectReviewSnapshot>>({});
  const displayRecords = applyReviewSnapshotOverrides(records, snapshotOverrides);
  function applySnapshot(recordId: string, snapshot: ProjectReviewSnapshot | undefined) {
    if (!snapshot) return;
    setSnapshotOverrides((prev) => ({ ...prev, [recordId]: snapshot }));
  }

  const detailsRecord = displayRecords.find((r) => r.id === detailsRecordId) ?? null;

  const [enrichmentRecordId, setEnrichmentRecordId] = useState<string | null>(null);
  const [enrichmentByRecordId, setEnrichmentByRecordId] = useState<Record<string, EnrichmentViewState>>({});
  const enrichmentRecord = displayRecords.find((r) => r.id === enrichmentRecordId) ?? null;
  const enrichmentState = enrichmentRecordId ? enrichmentByRecordId[enrichmentRecordId] : null;

  // Targeted fix (Research Automation) -- reuses the SAME `enrichmentRecordId`
  // ("which record's dialog is open") for the Research dialog too, so every
  // existing handleAcceptField/handleRejectField/handleUploadMedia/
  // handleViewHistory/handleUndo below works unchanged for a research-sourced
  // proposal -- it's the exact same acceptEnrichmentFieldAction mutation
  // either way. `researchMode` just picks which of the two dialogs renders.
  const [researchMode, setResearchMode] = useState(false);
  const [researchByRecordId, setResearchByRecordId] = useState<Record<string, { loading: boolean; result: ResearchRunResult | null }>>({});
  const researchState = researchMode && enrichmentRecordId ? researchByRecordId[enrichmentRecordId] : null;

  /**
   * Targeted fix (Research Project UX) -- the read-only Research Plan
   * (Section 2's handoff contract) that makes the interactive Claude+Chrome
   * workflow first-class in the dialog: project identity, target fields, and
   * generated queries, fetched via the existing buildResearchPlanAction
   * (no new server logic). Kept as its own state slice, independent of
   * researchByRecordId's automated-provider result, since the plan is
   * useful whether or not an automated provider ever runs.
   */
  const [researchPlanByRecordId, setResearchPlanByRecordId] = useState<Record<string, { loading: boolean; plan: ResearchPlanResult | null }>>({});
  const researchPlanState = researchMode && enrichmentRecordId ? researchPlanByRecordId[enrichmentRecordId] : null;

  // Search + Agent Change Visibility, Part 1/2/8/9 -- still a pure client-side
  // filter over the SAME already-loaded `records` array Phase 46 Part F's
  // enrichmentFilter already used (no new fetch/query, no data-grid/search-
  // engine infrastructure -- this page's entire pending queue was already
  // fully loaded into the browser before this task; see getPendingStagingRecords).
  // Initial values are seeded from the URL (Part 9) so a refresh/bookmark/
  // shared link reproduces the exact same filtered view.
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") ?? "");
  const [searchQuery, setSearchQuery] = useState(() => normalizeSearchQuery(searchParams.get("search") ?? ""));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => (searchParams.get("status") as StatusFilter) || "ALL");
  const [researchFilter, setResearchFilter] = useState<ResearchStatusFilter>(() => (searchParams.get("research") as ResearchStatusFilter) || "ALL");
  const [originFilter, setOriginFilter] = useState<OriginFilter>(() => (searchParams.get("origin") as OriginFilter) || "ALL");
  const [localityFilter, setLocalityFilter] = useState(() => searchParams.get("locality") ?? "");
  const [developerFilter, setDeveloperFilter] = useState(() => searchParams.get("developer") ?? "");
  const [researchChangesRecordId, setResearchChangesRecordId] = useState<string | null>(null);

  // Debounced (Part 8): typing updates `searchInput` immediately for a
  // responsive text box, but the actual filter pass + URL sync waits 250ms
  // after the last keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setSearchQuery(normalizeSearchQuery(searchInput)), 250);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (searchQuery) qs.set("search", searchQuery);
    if (statusFilter !== "ALL") qs.set("status", statusFilter);
    if (researchFilter !== "ALL") qs.set("research", researchFilter);
    if (originFilter !== "ALL") qs.set("origin", originFilter);
    if (localityFilter) qs.set("locality", localityFilter);
    if (developerFilter) qs.set("developer", developerFilter);
    const qsString = qs.toString();
    router.replace(qsString ? `${pathname}?${qsString}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, statusFilter, researchFilter, originFilter, localityFilter, developerFilter]);

  const localityOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.localityName).filter((v): v is string => Boolean(v)))).sort(),
    [records]
  );
  const developerOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.developerName).filter((v): v is string => Boolean(v)))).sort(),
    [records]
  );

  const visibleRecords = displayRecords.filter((r) =>
    matchesAllFilters(r, { search: searchQuery, status: statusFilter, research: researchFilter, origin: originFilter, locality: localityFilter, developer: developerFilter })
  );
  const isFiltered = Boolean(searchQuery || statusFilter !== "ALL" || researchFilter !== "ALL" || originFilter !== "ALL" || localityFilter || developerFilter);
  const researchChangesRecord = displayRecords.find((r) => r.id === researchChangesRecordId) ?? null;

  function runEnrichment(recordId: string) {
    setResearchMode(false);
    setEnrichmentRecordId(recordId);
    setEnrichmentByRecordId((prev) => ({ ...prev, [recordId]: { loading: true, result: null } }));
    startTransition(async () => {
      const result = await enrichProjectAction(recordId);
      setEnrichmentByRecordId((prev) => ({ ...prev, [recordId]: { loading: false, result } }));
      applySnapshot(recordId, result.snapshot);
      // Best-effort background sync for anything this snapshot doesn't cover
      // (e.g. a different record's row) -- the card above is already correct
      // without waiting for this to resolve.
      router.refresh();
    });
  }

  /**
   * Targeted fix (Research Automation) -- calls researchProjectAction, which
   * runs whatever automated ResearchProvider(s) are actually registered
   * (none, in this environment -- see lib/actions/research.ts's own doc
   * comment) through the EXACT SAME founder-authority/classification/
   * persistence pipeline as its sibling entry point, submitResearchFindingsAction
   * (see submitFindings below -- the concrete Claude+Chrome handoff, wired
   * into ResearchDialog's FindingsSubmitForm). This button never fakes a
   * "researching..." state with no real backend: with zero providers
   * configured, the dialog honestly reports NOT_CONFIGURED.
   */
  function runResearch(recordId: string) {
    setResearchMode(true);
    setEnrichmentRecordId(recordId);
    setResearchByRecordId((prev) => ({ ...prev, [recordId]: { loading: true, result: null } }));
    setResearchPlanByRecordId((prev) => ({ ...prev, [recordId]: { loading: true, plan: null } }));
    startTransition(async () => {
      const result = await researchProjectAction(recordId);
      setResearchByRecordId((prev) => ({ ...prev, [recordId]: { loading: false, result } }));
      applySnapshot(recordId, result.snapshot);
      router.refresh();
    });
    startTransition(async () => {
      const plan = await buildResearchPlanAction(recordId);
      setResearchPlanByRecordId((prev) => ({ ...prev, [recordId]: { loading: false, plan } }));
    });
  }

  /**
   * Targeted fix (Browser Integration Validation, Section 8) -- the concrete
   * connection point for submitResearchFindingsAction, invoked from a real
   * authenticated request (this admin session) rather than programmatically.
   * Findings collected by an interactive Claude+Chrome research pass are
   * pasted into ResearchDialog's FindingsSubmitForm and go through this exact
   * same identity-guard/classification/persistence pipeline as any other
   * research result -- nothing here bypasses runResearchPipeline.
   */
  async function submitFindings(recordId: string, findings: ResearchFinding[]): Promise<{ ok: boolean; error?: string }> {
    const result = await submitResearchFindingsAction(recordId, findings);
    setResearchByRecordId((prev) => ({ ...prev, [recordId]: { loading: false, result } }));
    applySnapshot(recordId, result.snapshot);
    router.refresh();
    // Refresh the Research Plan too -- a field just accepted into review should
    // drop off "still needs research" on the very next round, without the
    // founder having to close and reopen the dialog.
    startTransition(async () => {
      const plan = await buildResearchPlanAction(recordId);
      setResearchPlanByRecordId((prev) => ({ ...prev, [recordId]: { loading: false, plan } }));
    });
    if (result.status === "SUCCESS" || result.status === "NO_NEW_INFO") return { ok: true };
    return { ok: false, error: result.error ?? (result.rejectedFindings?.[0]?.reason || `Submission returned ${result.status}.`) };
  }

  async function handleAcceptField(
    field: EnrichmentField,
    editContext?: { founderEdited: true; overriddenValue: string | null; overriddenItems?: string[] }
  ): Promise<{ ok: boolean; error?: string }> {
    if (!enrichmentRecordId) return { ok: false, error: "No record open." };
    const result = await acceptEnrichmentFieldAction(enrichmentRecordId, field.key, field.proposedValue ?? "", field.proposedItems, {
      currentDisplayValue: field.currentValue,
      sourceUrl: field.sourceUrl,
      sourceType: field.sourceType,
      confidence: field.confidence,
      founderEdited: editContext?.founderEdited,
      overriddenValue: editContext?.overriddenValue,
      overriddenItems: editContext?.overriddenItems,
    });
    if (result.status === "SUCCESS") {
      applySnapshot(enrichmentRecordId, result.snapshot);
      router.refresh(); // best-effort background sync -- the card is already correct via applySnapshot above
      return { ok: true };
    }
    return { ok: false, error: result.error ?? "Could not save this field." };
  }

  /**
   * Targeted fix (Approval Ready inline editing) -- the SAME
   * acceptEnrichmentFieldAction every field-level edit already goes through
   * (never a second mutation path), called directly against whichever record
   * the View Data Details / Approval Ready dialog is currently open for.
   * `founderEdited: true` with `overriddenValue: null` gives this edit the
   * same founder-authority protection Task 2 built for Enrichment-dialog
   * edits, on a best-effort basis: this surface has no live classified
   * EnrichmentField to read the true external value from (that requires the
   * expensive Enrich Project fetch), so it assumes "nothing external was
   * known to be overridden" -- correct for the common case (most of these
   * fields, e.g. Official Developer Website, are fields no adapter has ever
   * reported a fact for), and safely conservative otherwise: if a source
   * genuinely does have a differing value, the next Enrich run surfaces it
   * once more for review rather than silently deferring to a stale guess.
   */
  async function handleInlineEditField(fieldKey: string, value: string): Promise<{ ok: boolean; error?: string }> {
    if (!detailsRecordId) return { ok: false, error: "No record open." };
    const result = await acceptEnrichmentFieldAction(detailsRecordId, fieldKey, value, undefined, {
      founderEdited: true,
      overriddenValue: null,
    });
    if (result.status === "SUCCESS") {
      applySnapshot(detailsRecordId, result.snapshot);
      router.refresh();
      return { ok: true };
    }
    return { ok: false, error: result.error ?? "Could not save this field." };
  }

  async function handleUploadMedia(
    fieldKey: string,
    file: File,
    editContext: UploadEnrichmentMediaContext
  ): Promise<{ ok: boolean; url?: string; error?: string }> {
    if (!enrichmentRecordId) return { ok: false, error: "No record open." };
    const result =
      fieldKey === "brochure"
        ? await uploadEnrichmentBrochureAction(enrichmentRecordId, file, editContext)
        : await uploadEnrichmentImageAction(enrichmentRecordId, "coverImage", file, editContext);
    if (result.status === "SUCCESS") {
      applySnapshot(enrichmentRecordId, result.snapshot);
      router.refresh(); // best-effort background sync -- the card is already correct via applySnapshot above
      return { ok: true, url: result.url };
    }
    return { ok: false, error: result.error ?? "Upload failed." };
  }

  async function handleRejectField(field: EnrichmentField, reason: string): Promise<{ ok: boolean; error?: string }> {
    if (!enrichmentRecordId) return { ok: false, error: "No record open." };
    const result = await rejectEnrichmentFieldAction(enrichmentRecordId, field.key, reason, {
      proposedValue: field.proposedValue,
      proposedItems: field.proposedItems,
      sourceUrl: field.sourceUrl,
      sourceType: field.sourceType,
      confidence: field.confidence,
    });
    if (result.status === "SUCCESS") {
      applySnapshot(enrichmentRecordId, result.snapshot);
      router.refresh(); // best-effort background sync -- the card is already correct via applySnapshot above
      return { ok: true };
    }
    return { ok: false, error: result.error ?? "Could not reject this proposal." };
  }

  async function handleAcceptEntityMatch(kind: "builder" | "locality", existingId: string): Promise<{ ok: boolean; error?: string }> {
    if (!enrichmentRecordId) return { ok: false, error: "No record open." };
    const result = await acceptEntityMatchAction(enrichmentRecordId, kind, existingId);
    if (result.status === "SUCCESS") {
      applySnapshot(enrichmentRecordId, result.snapshot);
      router.refresh();
      return { ok: true };
    }
    return { ok: false, error: result.error ?? `Could not save this ${kind}.` };
  }

  async function handleRejectEntityMatch(kind: "builder" | "locality", reason: string, proposedName: string): Promise<{ ok: boolean; error?: string }> {
    if (!enrichmentRecordId) return { ok: false, error: "No record open." };
    const result = await rejectEntityMatchAction(enrichmentRecordId, kind, reason, { proposedName });
    if (result.status === "SUCCESS") {
      applySnapshot(enrichmentRecordId, result.snapshot);
      router.refresh();
      return { ok: true };
    }
    return { ok: false, error: result.error ?? `Could not reject this ${kind} match.` };
  }

  async function handleViewHistory(fieldKey: string): Promise<EnrichmentHistoryEntry[]> {
    if (!enrichmentRecordId) return [];
    return getEnrichmentFieldHistoryAction(enrichmentRecordId, fieldKey);
  }

  async function handleUndo(fieldKey: string, historyEventId: string): Promise<{ ok: boolean; error?: string }> {
    if (!enrichmentRecordId) return { ok: false, error: "No record open." };
    const result = await revertEnrichmentFieldAction(enrichmentRecordId, fieldKey, historyEventId);
    if (result.status === "SUCCESS") {
      applySnapshot(enrichmentRecordId, result.snapshot);
      router.refresh();
      return { ok: true };
    }
    return { ok: false, error: result.error ?? "Could not undo this field." };
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    // Scoped to the currently VISIBLE (filtered) records -- selecting "all"
    // while a filter narrows the list must never silently select a hidden row.
    setSelected((prev) => (prev.size === visibleRecords.length ? new Set() : new Set(visibleRecords.map((r) => r.id))));
  }

  function runBulkApprove() {
    setBulkError(null);
    startTransition(async () => {
      const result = await bulkApproveStagingRecordsAction(Array.from(selected));
      if (result.error) {
        setBulkError(result.error);
        return;
      }
      if (result.failed) setBulkError(`${result.failed} record(s) failed to approve`);
      setSelected(new Set());
      router.refresh();
    });
  }

  function runBulkReject() {
    setBulkError(null);
    startTransition(async () => {
      const result = await bulkRejectStagingRecordsAction(Array.from(selected));
      if (result.error) {
        setBulkError(result.error);
        return;
      }
      if (result.failed) setBulkError(`${result.failed} record(s) failed to reject`);
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={selected.size === visibleRecords.length && visibleRecords.length > 0} onChange={toggleAll} className="h-3.5 w-3.5 accent-accent" />
          Select all
        </label>
        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-sm border border-accent/40 bg-accent/5 px-3 py-2">
            <span className="text-xs text-foreground">{selected.size} selected</span>
            <button
              type="button"
              disabled={isPending}
              onClick={runBulkApprove}
              className="rounded-sm border border-positive/40 px-2 py-1 text-[11px] font-mono uppercase text-positive hover:bg-positive/10"
            >
              Bulk Approve
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={runBulkReject}
              className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase text-muted hover:border-negative hover:text-negative"
            >
              Bulk Reject
            </button>
            {bulkError ? <span className="text-[11px] text-negative">{bulkError}</span> : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search projects, RERA, developer, locality..."
          className="w-full max-w-md rounded-sm border border-border bg-surface px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-sm border border-border bg-surface px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent"
          >
            <option value="ALL">Status: All</option>
            <option value="PENDING">Enrichment pending</option>
            <option value="CONFLICTS">Conflicts</option>
            <option value="NOT_ENRICHED">Not enriched</option>
            <option value="APPROVAL_READY">Approval ready</option>
          </select>

          <select
            value={researchFilter}
            onChange={(e) => setResearchFilter(e.target.value as ResearchStatusFilter)}
            className="rounded-sm border border-border bg-surface px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent"
          >
            <option value="ALL">Research: All</option>
            <option value="RESEARCHED">Researched by agent</option>
            <option value="NOT_RESEARCHED">Not researched</option>
            <option value="HAS_CHANGES">Research has changes</option>
            <option value="HAS_CONFLICTS">Research has conflicts</option>
          </select>

          <select
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value as OriginFilter)}
            className="rounded-sm border border-border bg-surface px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent"
          >
            <option value="ALL">Origin: All</option>
            <option value="ORIGINAL_INGESTION">Original ingestion</option>
            <option value="AUTOMATIC_ENRICHMENT">Automatic enrichment</option>
            <option value="RESEARCH">Claude/browser research</option>
            <option value="FOUNDER_EDITED">Founder edited</option>
          </select>

          {localityOptions.length > 0 ? (
            <select
              value={localityFilter}
              onChange={(e) => setLocalityFilter(e.target.value)}
              className="rounded-sm border border-border bg-surface px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent"
            >
              <option value="">Locality: All</option>
              {localityOptions.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          ) : null}

          {developerOptions.length > 0 ? (
            <select
              value={developerFilter}
              onChange={(e) => setDeveloperFilter(e.target.value)}
              className="rounded-sm border border-border bg-surface px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent"
            >
              <option value="">Developer: All</option>
              {developerOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          ) : null}

          {isFiltered ? (
            <span className="text-[11px] text-muted">
              {visibleRecords.length} of {records.length}
            </span>
          ) : null}
        </div>
      </div>

      {visibleRecords.length === 0 ? (
        <p className="rounded-sm border border-border p-4 text-xs text-muted">No records match this filter.</p>
      ) : null}

      {visibleRecords.map((record) => (
        <div key={record.id} className="rounded-sm border border-border p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(record.id)}
                onChange={() => toggleOne(record.id)}
                className="mt-1 h-3.5 w-3.5 accent-accent"
              />
              <div className="grid flex-1 grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted">
                    {record.proposedLabel} (from {record.sourceKey} · {formatDate(record.createdAt)})
                  </p>
                  <p className="mt-1 font-mono text-foreground">{record.proposedTitle}</p>
                  {record.proposedLines.map((line, i) => (
                    <p key={i} className="text-muted">
                      {line}
                    </p>
                  ))}
                  {record.enrichmentBadge ? (
                    <div className="mt-1">
                      <EnrichmentBadgeLine badge={record.enrichmentBadge} />
                    </div>
                  ) : null}
                  {record.researchActivity ? <ResearchBadgeLine activity={record.researchActivity} onOpen={() => setResearchChangesRecordId(record.id)} /> : null}
                </div>

                {record.matchTitle ? (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted">{record.matchLabel}</p>
                    <p className="mt-1 font-mono text-foreground">{record.matchTitle}</p>
                    {record.matchLines.map((line, i) => (
                      <p key={i} className="text-muted">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted">No existing match found</p>
                    <p className="mt-1 text-muted">{record.noMatchNote}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <ConfirmButton
                action={approveStagingRecordAction.bind(null, record.id)}
                label="Approve"
                confirmLabel="Approve?"
                className="border-positive/40 text-positive hover:border-positive hover:text-positive"
              />
              <ConfirmButton action={rejectStagingRecordAction.bind(null, record.id)} label="Reject" confirmLabel="Reject?" />
              {record.isProject ? (
                <button
                  type="button"
                  onClick={() => runEnrichment(record.id)}
                  className="rounded-sm border border-accent/40 px-2 py-1 text-[11px] font-mono uppercase text-accent hover:bg-accent/10"
                >
                  Enrich Project
                </button>
              ) : null}
              {record.isProject ? (
                <button
                  type="button"
                  onClick={() => runResearch(record.id)}
                  className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase text-muted hover:border-accent hover:text-accent"
                  title="Research this project's missing/needs-review/conflict fields using registered research providers"
                >
                  Research Project
                </button>
              ) : null}
            </div>
          </div>

          {record.completeness ? (
            <div className="mt-3 border-t border-border pt-3">
              {record.isProject && record.readiness ? (
                <button
                  type="button"
                  onClick={() => setDetailsRecordId(record.id)}
                  className="mb-2 flex w-full flex-col items-start gap-1 rounded-sm border border-border p-2 text-left hover:border-accent"
                >
                  {record.readiness.status === "READY" ? (
                    <span className="text-[11px] text-positive">✓ Approval Ready</span>
                  ) : (
                    <span className="text-[11px] text-warning">⚠ {record.readiness.neededFieldLabels.length} field(s) need attention</span>
                  )}
                  {record.readiness.missingFieldLabels.length > 0 ? (
                    <span className="text-[10px] text-muted">
                      Missing: {record.readiness.missingFieldLabels.slice(0, 3).join(", ")}
                      {record.readiness.missingFieldLabels.length > 3 ? `, +${record.readiness.missingFieldLabels.length - 3} more` : ""}
                    </span>
                  ) : null}
                </button>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3 text-[11px]">
                  <span className="font-mono text-foreground">
                    {record.completeness.receivedCount} / {record.completeness.totalFields} ingestion fields received
                  </span>
                  <span className="text-positive">🟢 {record.completeness.receivedCount} Received</span>
                  <span className="text-negative">🔴 {record.completeness.missingCount} Missing</span>
                  {record.completeness.needsReviewCount > 0 ? (
                    <span className="text-warning">🟠 {record.completeness.needsReviewCount} Needs Review</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setDetailsRecordId(record.id)}
                  className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                >
                  View Data Details
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ))}

      {detailsRecord?.completeness ? (
        <ReviewDataDetailsDialog
          title={detailsRecord.proposedTitle}
          sourceKey={detailsRecord.sourceKey}
          completeness={detailsRecord.completeness}
          isProject={detailsRecord.isProject}
          enrichmentOutstanding={detailsRecord.enrichmentOutstanding}
          onEditField={detailsRecord.isProject ? handleInlineEditField : undefined}
          onClose={() => setDetailsRecordId(null)}
        />
      ) : null}

      {!researchMode && enrichmentRecord && enrichmentState ? (
        <EnrichmentDialog
          title={enrichmentRecord.proposedTitle}
          loading={enrichmentState.loading}
          status={enrichmentState.result?.status ?? null}
          fields={enrichmentState.result?.fields ?? null}
          builderMatch={enrichmentState.result?.builderMatch}
          localityMatch={enrichmentState.result?.localityMatch}
          error={enrichmentState.result?.error ?? null}
          onClose={() => setEnrichmentRecordId(null)}
          onRetry={() => runEnrichment(enrichmentRecord.id)}
          onAcceptField={handleAcceptField}
          onRejectField={handleRejectField}
          onUploadMedia={handleUploadMedia}
          onAcceptEntityMatch={handleAcceptEntityMatch}
          onRejectEntityMatch={handleRejectEntityMatch}
          onViewHistory={handleViewHistory}
          onUndo={handleUndo}
        />
      ) : null}

      {researchMode && enrichmentRecord && researchState ? (
        <ResearchDialog
          title={enrichmentRecord.proposedTitle}
          loading={researchState.loading}
          status={researchState.result?.status ?? null}
          fields={researchState.result?.fields ?? null}
          error={researchState.result?.error ?? null}
          rejectedFindings={researchState.result?.rejectedFindings}
          planLoading={researchPlanState?.loading ?? false}
          plan={researchPlanState?.plan ?? null}
          onClose={() => {
            setEnrichmentRecordId(null);
            setResearchMode(false);
          }}
          onRetry={() => runResearch(enrichmentRecord.id)}
          onSubmitFindings={(findings) => submitFindings(enrichmentRecord.id, findings)}
          onAcceptField={handleAcceptField}
          onRejectField={handleRejectField}
          onUploadMedia={handleUploadMedia}
          onViewHistory={handleViewHistory}
          onUndo={handleUndo}
        />
      ) : null}

      {researchChangesRecord?.researchActivity ? (
        <ResearchChangesDialog
          title={researchChangesRecord.proposedTitle}
          activity={researchChangesRecord.researchActivity}
          completeness={researchChangesRecord.completeness}
          onClose={() => setResearchChangesRecordId(null)}
        />
      ) : null}
    </div>
  );
}
