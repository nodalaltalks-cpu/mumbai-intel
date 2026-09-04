"use client";

import { Fragment, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Badge, { type BadgeTone } from "@/app/components/ui/Badge";
import StickyHorizontalScrollbar from "./StickyHorizontalScrollbar";
import { formatDate } from "@/lib/format";
import type { DiscoveryFounderAction } from "@/lib/ingestion/discovery/statusTransitions";
import type {
  DiscoveryDuplicateMatch,
  DiscoveryDuplicateStatus,
  DiscoveryStatus,
  ProjectDiscoveryCandidatePayload,
} from "@/lib/ingestion/discovery/types";
import type { DiscoveryCandidateEditInput } from "@/lib/actions/discovery";
import { saveDeveloperWebsiteAction } from "@/lib/actions/builders";
import type { SavedDeveloperWebsite } from "@/lib/enrichment/developerWebsite";

export interface DiscoveryCandidateRow {
  id: string;
  status: DiscoveryStatus;
  payload: ProjectDiscoveryCandidatePayload;
  matchedExistingName: string | null;
  /** Phase 58 — a freshly re-checked duplicate result (same check Include itself runs), null when it couldn't be re-checked (locality unresolved) or wasn't attempted (row already resolved) — the UI falls back to payload.duplicateStatus/duplicateMatch in that case. */
  liveDuplicateStatus: DiscoveryDuplicateStatus | null;
  liveDuplicateMatch: DiscoveryDuplicateMatch | null;
  createdAt: string;
  /** Phase 59 — non-null once a founder has made ANY Include/Exclude/Review decision on this row — used to decide whether changing the decision now needs a confirmation. */
  reviewedAt: string | null;
  /** Phase 69 — this row's developerName resolved (EXACT match only) against the existing Builder registry's own websiteUrl. Null means either no matching Builder exists yet, or one exists with no saved website — see `builderId` presence to distinguish (the edit panel checks this directly). */
  savedDeveloperWebsite: SavedDeveloperWebsite | null;
}

const STATUS_TONE: Record<DiscoveryStatus, BadgeTone> = {
  DISCOVERED: "muted",
  SOURCE_FOUND: "info",
  READY_FOR_ENRICHMENT: "positive",
  PROJECT_STAGED: "positive",
  ENRICHED: "positive",
  NEEDS_REVIEW: "warning",
  REJECTED_DUPLICATE: "negative",
  EXCLUDED: "muted",
};

interface DuplicateDisplay {
  tone: BadgeTone;
  /** Short badge label — plain language, no raw enum values (Phase 58 Part 5: founders/non-technical users read this). */
  label: string;
  /** One-line summary shown under the badge. */
  headline: string;
  /** True for a duplicate the system already knows about (EXACT/CLEAR_ALIAS) — Include is disabled rather than left to fail after a confusing click. */
  blocksInclude: boolean;
  /** Plain-language reason shown next to the Include button when blocksInclude is true. */
  explanation: string | null;
}

/**
 * Phase 58 — turns a duplicate result (live-checked when available, the
 * stored snapshot otherwise — see liveDuplicateStatus.ts) into what a
 * founder should actually see: never a bare "EXACT"/"CLEAR_ALIAS"/
 * "AMBIGUOUS" label. The raw technical status is still shown, just
 * secondary/small, per Phase 58's own instruction to keep it available for
 * debugging without leading with it.
 *
 * `confirmedByStatus` is set when the candidate's own `status` is already
 * REJECTED_DUPLICATE — the real bug this phase fixes: applyDiscoveryFounderAction
 * (lib/actions/discovery.ts) sets that status the moment Include finds a live
 * duplicate, but never rewrites the payload's own `duplicateStatus` field to
 * match, so it can stay frozen at "NO_MATCH" forever after. A REJECTED_DUPLICATE
 * status is a DECISIVE, already-made determination — more reliable than that
 * frozen field — so it always wins here, regardless of what `status` (the
 * duplicateStatus enum value, confusingly reused as this function's own first
 * parameter name below) says.
 */
function describeDuplicate(status: DiscoveryDuplicateStatus, existingName: string | null, confirmedByStatus: boolean): DuplicateDisplay {
  const name = existingName || null;
  if (confirmedByStatus || status === "EXACT" || status === "CLEAR_ALIAS") {
    return {
      tone: "negative",
      label: "Duplicate",
      headline: name ? `Already exists as "${name}"` : "This project already exists in Mumbai Intel",
      blocksInclude: true,
      explanation: name
        ? `Not included because this project already exists in Mumbai Intel as "${name}".`
        : "Not included because this project already exists in Mumbai Intel.",
    };
  }
  if (status === "AMBIGUOUS") {
    return {
      tone: "warning",
      label: "Possible duplicate",
      headline: name ? `May already exist as "${name}"` : "May already exist — needs a look",
      blocksInclude: false,
      explanation: null,
    };
  }
  return { tone: "positive", label: "New", headline: "No matching project found", blocksInclude: false, explanation: null };
}

interface DecisionDisplay {
  label: string;
  tone: BadgeTone;
}

/**
 * Phase 59 — the founder's actual DECISION, distinct from the raw lifecycle
 * `status` badge (which also carries pipeline-internal states like SOURCE_FOUND
 * that aren't a decision at all). REJECTED_DUPLICATE is a system decision, not
 * a founder one, but reads the same as "excluded" to a founder, so it's labeled
 * that way with the reason kept alongside.
 */
function decisionForStatus(status: DiscoveryStatus): DecisionDisplay {
  switch (status) {
    case "PROJECT_STAGED":
    case "READY_FOR_ENRICHMENT":
    case "ENRICHED":
      return { label: "INCLUDED", tone: "positive" };
    case "EXCLUDED":
      return { label: "EXCLUDED", tone: "negative" };
    case "REJECTED_DUPLICATE":
      return { label: "EXCLUDED — duplicate", tone: "negative" };
    case "NEEDS_REVIEW":
      return { label: "NEEDS REVIEW", tone: "warning" };
    default:
      return { label: "Not yet decided", tone: "muted" };
  }
}

const ACTION_DECISION_LABEL: Record<DiscoveryFounderAction, string> = {
  INCLUDE: "INCLUDED",
  EXCLUDE: "EXCLUDED",
  REVIEW: "NEEDS REVIEW",
};

interface EditDraft {
  projectName: string;
  developerName: string;
  areaName: string;
  officialDeveloperUrl: string;
  founderStatusNote: string;
  founderDecisionNote: string;
}

function draftFromPayload(p: ProjectDiscoveryCandidatePayload): EditDraft {
  return {
    projectName: p.projectName,
    developerName: p.developerName,
    areaName: p.areaName,
    officialDeveloperUrl: p.officialDeveloperUrl ?? "",
    founderStatusNote: p.founderStatusNote ?? "",
    founderDecisionNote: p.founderDecisionNote ?? "",
  };
}

const inputClass =
  "w-full rounded-sm border border-border bg-surface px-2 py-1 text-xs text-foreground focus:border-accent focus:outline-none";

/**
 * Phase 39 Part I — the founder-facing discovery review list. Deliberately
 * NOT a rebuild of ReviewQueueList (which is Project/Builder/Locality/
 * Transaction/InfraAsset-specific and untouched by this phase) — a plain
 * table with three actions (Include / Exclude / Review), matching Part J's
 * "smallest system" instruction. Every action just relabels one staging
 * row's status via applyDiscoveryFounderAction; nothing here ever touches a
 * real Project.
 *
 * Phase 59 — adds an inline edit panel (source URLs, name/developer/locality,
 * founder notes) and makes clear that Include/Exclude/Review is never a
 * one-way door: every action is still just a status relabel, so re-clicking
 * a different one later is already how this always worked — this phase makes
 * that visible (a distinct "Decision" line, a confirmation before changing
 * an already-made decision) rather than changing the underlying mechanics.
 */
export default function DiscoveryCandidateList({
  rows,
  onAction,
  onEdit,
}: {
  rows: DiscoveryCandidateRow[];
  onAction: (id: string, action: DiscoveryFounderAction) => Promise<{ ok: boolean; error?: string; projectStagingRecordId?: string }>;
  onEdit: (id: string, edits: DiscoveryCandidateEditInput) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [localStatus, setLocalStatus] = useState<Record<string, DiscoveryStatus>>({});
  const [stagedProjectId, setStagedProjectId] = useState<Record<string, string>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, EditDraft>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState<string | null>(null);

  const [savingWebsiteId, setSavingWebsiteId] = useState<string | null>(null);
  const [websiteErrors, setWebsiteErrors] = useState<Record<string, string>>({});

  async function handleAction(row: DiscoveryCandidateRow, action: DiscoveryFounderAction) {
    const currentDecision = decisionForStatus(localStatus[row.id] ?? row.status).label;
    const targetDecision = ACTION_DECISION_LABEL[action];
    if (row.reviewedAt && currentDecision !== targetDecision) {
      const confirmed = window.confirm(
        `This candidate's decision is currently "${currentDecision}". Change it to "${targetDecision}"?`
      );
      if (!confirmed) return;
    }

    setBusyId(row.id);
    const result = await onAction(row.id, action);
    setBusyId(null);
    if (result.ok) {
      setErrors((prev) => ({ ...prev, [row.id]: "" }));
      const next: DiscoveryStatus = action === "EXCLUDE" ? "EXCLUDED" : action === "REVIEW" ? "NEEDS_REVIEW" : "PROJECT_STAGED";
      setLocalStatus((prev) => ({ ...prev, [row.id]: next }));
      if (result.projectStagingRecordId) setStagedProjectId((prev) => ({ ...prev, [row.id]: result.projectStagingRecordId! }));
    } else {
      setErrors((prev) => ({ ...prev, [row.id]: result.error ?? "Could not update this candidate." }));
    }
    // Phase 59 — a failed Include still writes a status change (e.g. REJECTED_DUPLICATE) server-side; refresh
    // so the row's true current state is never left showing a stale local guess.
    router.refresh();
  }

  function openEdit(row: DiscoveryCandidateRow) {
    setDrafts((prev) => ({ ...prev, [row.id]: draftFromPayload(row.payload) }));
    setEditErrors((prev) => ({ ...prev, [row.id]: "" }));
    setEditingId(row.id);
  }

  function closeEdit() {
    setEditingId(null);
  }

  function updateDraft(id: string, patch: Partial<EditDraft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function saveEdit(row: DiscoveryCandidateRow) {
    const draft = drafts[row.id];
    if (!draft) return;
    const original = draftFromPayload(row.payload);

    const edits: DiscoveryCandidateEditInput = {};
    if (draft.projectName !== original.projectName) edits.projectName = draft.projectName;
    if (draft.developerName !== original.developerName) edits.developerName = draft.developerName;
    if (draft.areaName !== original.areaName) edits.areaName = draft.areaName;
    if (draft.officialDeveloperUrl !== original.officialDeveloperUrl) edits.officialDeveloperUrl = draft.officialDeveloperUrl;
    if (draft.founderStatusNote !== original.founderStatusNote) edits.founderStatusNote = draft.founderStatusNote;
    if (draft.founderDecisionNote !== original.founderDecisionNote) edits.founderDecisionNote = draft.founderDecisionNote;

    if (Object.keys(edits).length === 0) {
      closeEdit();
      return;
    }

    setEditSaving(row.id);
    const result = await onEdit(row.id, edits);
    setEditSaving(null);
    if (result.ok) {
      setEditErrors((prev) => ({ ...prev, [row.id]: "" }));
      // Phase 70 — a saved edit can change exactly what would make an
      // earlier Include/Exclude/Review attempt's error message accurate
      // (e.g. renaming away from a real duplicate). Leaving that stale
      // error visible made a genuinely successful Include right afterward
      // look like it had just failed, even though the error predates this
      // save and has nothing to do with the click that follows it.
      setErrors((prev) => ({ ...prev, [row.id]: "" }));
      closeEdit();
      router.refresh();
    } else {
      setEditErrors((prev) => ({ ...prev, [row.id]: result.error ?? "Could not save these changes." }));
    }
  }

  /**
   * Phase 69 — writes the current draft's officialDeveloperUrl to the
   * developer's CANONICAL Builder.websiteUrl (Requirement 3/6), a genuinely
   * separate write from `saveEdit` above (that one persists only THIS
   * candidate's own field via the existing per-candidate edit path,
   * Requirement 7). Requires explicit confirmation when overwriting an
   * already-saved, different value — never a silent overwrite (Requirement 6).
   */
  async function saveDeveloperWebsite(row: DiscoveryCandidateRow) {
    const draft = drafts[row.id];
    const saved = row.savedDeveloperWebsite;
    if (!draft || !saved) return;

    if (saved.websiteUrl && saved.websiteUrl !== draft.officialDeveloperUrl) {
      const confirmed = window.confirm(
        `${saved.builderName} already has a saved website (${saved.websiteUrl}). Update it to "${draft.officialDeveloperUrl}" for every project by this developer?`
      );
      if (!confirmed) return;
    }

    setSavingWebsiteId(row.id);
    const result = await saveDeveloperWebsiteAction(saved.builderId, draft.officialDeveloperUrl);
    setSavingWebsiteId(null);
    if (result.ok) {
      setWebsiteErrors((prev) => ({ ...prev, [row.id]: "" }));
      router.refresh();
    } else {
      setWebsiteErrors((prev) => ({ ...prev, [row.id]: result.error ?? "Could not save the developer website." }));
    }
  }

  return (
    <>
    <div ref={tableScrollRef} className="max-h-[70vh] overflow-auto rounded-sm border border-border">
      <table className="w-full min-w-[1200px] border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-surface-raised">
          <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
            <th className="px-3 py-2 text-left">Project</th>
            <th className="px-3 py-2 text-left">Developer</th>
            <th className="px-3 py-2 text-left">Area</th>
            <th className="px-3 py-2 text-left">Discovery source</th>
            <th className="px-3 py-2 text-left">Developer website (A)</th>
            <th className="px-3 py-2 text-left">Confidence</th>
            <th className="px-3 py-2 text-left">Already exists?</th>
            <th className="px-3 py-2 text-left">Decision</th>
            <th className="px-3 py-2 text-left">Next action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = localStatus[row.id] ?? row.status;
            const busy = busyId === row.id;
            const p = row.payload;
            // Phase 58 — prefer the freshly re-checked result over the stored snapshot, so the badge and the
            // Include button always agree with what clicking Include would actually do.
            const effectiveDuplicateStatus = row.liveDuplicateStatus ?? p.duplicateStatus;
            const effectiveDuplicateMatch = row.liveDuplicateMatch ?? p.duplicateMatch;
            // The name to actually show: prefer matchedExistingName (a live DB lookup against the
            // matched Project/pending-staging row's CURRENT name), since payload.duplicateMatch can be
            // null even when status is already REJECTED_DUPLICATE — applyDiscoveryFounderAction updates
            // matchedExistingId at Include time but never rewrites the payload snapshot to match.
            const displayExistingName = row.matchedExistingName ?? effectiveDuplicateMatch?.existingName ?? null;
            const duplicateInfo = describeDuplicate(effectiveDuplicateStatus, displayExistingName, status === "REJECTED_DUPLICATE");
            const decision = decisionForStatus(status);
            const isEditing = editingId === row.id;
            const draft = drafts[row.id];

            return (
              <Fragment key={row.id}>
                <tr className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 align-top text-foreground">{p.projectName}</td>
                  <td className="px-3 py-2 align-top text-foreground">{p.developerName}</td>
                  <td className="px-3 py-2 align-top text-muted">{p.areaName}</td>
                  <td className="px-3 py-2 align-top text-muted">
                    {p.discoverySource}
                    <br />
                    <span className="text-[10px]">{formatDate(row.createdAt)}</span>
                    {p.founderStatusNote ? (
                      <p className="mt-1 text-[10px] text-foreground">
                        <span className="text-muted">Founder note: </span>
                        {p.founderStatusNote}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {p.officialSourceStatus === "IDENTIFIED" && p.officialDeveloperUrl ? (
                      <a href={p.officialDeveloperUrl} target="_blank" rel="noreferrer" className="break-all text-accent hover:underline">
                        {p.officialDeveloperUrl}
                      </a>
                    ) : (
                      <Badge tone="warning">Not verified</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-muted">{p.confidence}</td>
                  <td className="px-3 py-2 align-top">
                    <Badge tone={duplicateInfo.tone}>{duplicateInfo.label}</Badge>
                    <p className="mt-1 text-[10px] text-foreground">{duplicateInfo.headline}</p>
                    <p className="mt-0.5 text-[9px] text-muted">technical: {effectiveDuplicateStatus.replace("_", " ")}</p>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <p className="text-[9px] uppercase tracking-wide text-muted">Decision</p>
                    <Badge tone={decision.tone}>{decision.label}</Badge>
                    <p className="mt-1">
                      <Badge tone={STATUS_TONE[status]}>{status.replace(/_/g, " ")}</Badge>
                    </p>
                    {stagedProjectId[row.id] ? (
                      <p className="mt-1">
                        <a href={`/admin/data-sync/review`} className="text-[10px] text-accent hover:underline">
                          View in Project Review Queue →
                        </a>
                      </p>
                    ) : null}
                    {p.founderDecisionNote ? (
                      <p className="mt-1 text-[10px] text-muted">
                        <span className="text-foreground">Reason: </span>
                        {p.founderDecisionNote}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busy || isEditing || status === "PROJECT_STAGED" || status === "REJECTED_DUPLICATE" || duplicateInfo.blocksInclude}
                          onClick={() => handleAction(row, "INCLUDE")}
                          title={
                            isEditing
                              ? "Save or cancel your edits first — Include always acts on the saved record, never an in-progress edit."
                              : duplicateInfo.blocksInclude
                                ? (duplicateInfo.explanation ?? undefined)
                                : undefined
                          }
                          className="rounded-sm border border-positive/40 px-2 py-0.5 text-[10px] font-mono uppercase text-positive hover:bg-positive/10 disabled:opacity-50"
                        >
                          ✓ Include
                        </button>
                        <button
                          type="button"
                          disabled={busy || isEditing}
                          title={isEditing ? "Save or cancel your edits first." : undefined}
                          onClick={() => handleAction(row, "EXCLUDE")}
                          className="rounded-sm border border-negative/40 px-2 py-0.5 text-[10px] font-mono uppercase text-negative hover:bg-negative/10 disabled:opacity-50"
                        >
                          ✕ Exclude
                        </button>
                        <button
                          type="button"
                          disabled={busy || isEditing}
                          title={isEditing ? "Save or cancel your edits first." : undefined}
                          onClick={() => handleAction(row, "REVIEW")}
                          className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          Review
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => (isEditing ? closeEdit() : openEdit(row))}
                        className="w-fit rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-accent hover:text-accent"
                      >
                        {isEditing ? "Cancel edit" : "Edit details"}
                      </button>
                      {duplicateInfo.blocksInclude && status !== "PROJECT_STAGED" ? (
                        <span className="text-[10px] text-muted">{duplicateInfo.explanation}</span>
                      ) : null}
                      {status === "PROJECT_STAGED" ? (
                        <span className="text-[10px] text-muted">Already staged as a Project — change that decision in the Project Review Queue.</span>
                      ) : null}
                      {errors[row.id] ? <span className="text-[10px] text-negative">{errors[row.id]}</span> : null}
                    </div>
                  </td>
                </tr>
                {isEditing && draft ? (
                  <tr key={`${row.id}-edit`} className="border-b border-border bg-surface-raised last:border-b-0">
                    <td colSpan={9} className="px-3 py-3">
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-wide text-muted">Project name</span>
                          <input
                            className={inputClass}
                            value={draft.projectName}
                            onChange={(e) => updateDraft(row.id, { projectName: e.target.value })}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-wide text-muted">Developer</span>
                          <input
                            className={inputClass}
                            value={draft.developerName}
                            onChange={(e) => updateDraft(row.id, { developerName: e.target.value })}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-wide text-muted">Locality / area</span>
                          <input className={inputClass} value={draft.areaName} onChange={(e) => updateDraft(row.id, { areaName: e.target.value })} />
                        </label>
                        <label className="flex flex-col gap-1 md:col-span-2">
                          <span className="text-[10px] uppercase tracking-wide text-muted">
                            Developer website (A) — the developer&rsquo;s homepage, e.g. https://gurukruparealcon.com/
                          </span>
                          {row.savedDeveloperWebsite ? (
                            row.savedDeveloperWebsite.websiteUrl ? (
                              <select
                                className={inputClass}
                                value={draft.officialDeveloperUrl === row.savedDeveloperWebsite.websiteUrl ? "saved" : "custom"}
                                onChange={(e) => {
                                  if (e.target.value === "saved" && row.savedDeveloperWebsite?.websiteUrl) {
                                    updateDraft(row.id, { officialDeveloperUrl: row.savedDeveloperWebsite.websiteUrl });
                                  }
                                }}
                              >
                                <option value="custom">Enter a different URL below…</option>
                                <option value="saved">Use saved website — {row.savedDeveloperWebsite.websiteUrl}</option>
                              </select>
                            ) : (
                              <p className="text-[10px] text-muted">No saved website for {row.savedDeveloperWebsite.builderName} yet.</p>
                            )
                          ) : (
                            <p className="text-[10px] text-muted">
                              No matching Builder record for &ldquo;{draft.developerName}&rdquo; — this website will only apply to this candidate.
                            </p>
                          )}
                          <input
                            className={inputClass}
                            type="url"
                            placeholder="https://…"
                            value={draft.officialDeveloperUrl}
                            onChange={(e) => updateDraft(row.id, { officialDeveloperUrl: e.target.value })}
                          />
                          {row.savedDeveloperWebsite ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={
                                  savingWebsiteId === row.id ||
                                  !draft.officialDeveloperUrl ||
                                  draft.officialDeveloperUrl === row.savedDeveloperWebsite.websiteUrl
                                }
                                onClick={() => saveDeveloperWebsite(row)}
                                className="w-fit rounded-sm border border-accent/40 px-2 py-0.5 text-[10px] font-mono uppercase text-accent hover:bg-accent/10 disabled:opacity-50"
                              >
                                {savingWebsiteId === row.id
                                  ? "Saving…"
                                  : row.savedDeveloperWebsite.websiteUrl
                                    ? "Update Developer Website"
                                    : "Save to Developer"}
                              </button>
                              {websiteErrors[row.id] ? <span className="text-[10px] text-negative">{websiteErrors[row.id]}</span> : null}
                            </div>
                          ) : null}
                        </label>
                        <label className="flex flex-col gap-1 md:col-span-3">
                          <span className="text-[10px] uppercase tracking-wide text-muted">Status note (optional) — what you found about its real-world status</span>
                          <input
                            className={inputClass}
                            value={draft.founderStatusNote}
                            onChange={(e) => updateDraft(row.id, { founderStatusNote: e.target.value })}
                            placeholder="e.g. Confirmed under construction via site visit, Sep 2026"
                          />
                        </label>
                        <label className="flex flex-col gap-1 md:col-span-3">
                          <span className="text-[10px] uppercase tracking-wide text-muted">Decision note (optional) — why you're including/excluding/reviewing this</span>
                          <input
                            className={inputClass}
                            value={draft.founderDecisionNote}
                            onChange={(e) => updateDraft(row.id, { founderDecisionNote: e.target.value })}
                            placeholder="e.g. Excluding — same tower as an already-approved project"
                          />
                        </label>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={editSaving === row.id}
                          onClick={() => saveEdit(row)}
                          className="rounded-sm border border-accent/40 bg-accent/10 px-3 py-1 text-[10px] font-mono uppercase text-accent hover:bg-accent/20 disabled:opacity-50"
                        >
                          {editSaving === row.id ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={closeEdit}
                          className="rounded-sm border border-border px-3 py-1 text-[10px] font-mono uppercase text-muted hover:border-accent hover:text-accent"
                        >
                          Cancel
                        </button>
                        {editErrors[row.id] ? <span className="text-[10px] text-negative">{editErrors[row.id]}</span> : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
    <StickyHorizontalScrollbar targetRef={tableScrollRef} watch={rows.map((r) => r.id).join(",")} />
    </>
  );
}
