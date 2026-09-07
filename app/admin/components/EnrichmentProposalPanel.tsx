"use client";

import { useState } from "react";
import Badge, { type BadgeTone } from "@/app/components/ui/Badge";
import type { EnrichmentClassification, EnrichmentField } from "@/lib/enrichment/types";
import { SOURCE_TIER_LABEL } from "@/lib/enrichment/types";
import { getFieldEditorKind, isFieldManuallyEditable, validateProposedEdit, type FieldEditorKind } from "@/lib/enrichment/applyAcceptedField";
import type { EnrichmentHistoryEntry } from "@/lib/enrichment/enrichmentHistory";
import { CATEGORY_LABEL, POSSESSION_MONTH_LABEL, STATUS_LABEL } from "@/lib/project-meta";
import {
  formatPaymentPlanEntries,
  parsePaymentPlanEntries,
  type PaymentPlanEntry,
} from "@/lib/ingestion/paymentPlanFormat";
import EnrichmentFieldHistoryDialog from "./EnrichmentFieldHistoryDialog";

const CLASSIFICATION_BADGE: Record<EnrichmentClassification, { tone: BadgeTone; label: string; icon: string }> = {
  CONFIRMED: { tone: "positive", label: "Confirmed", icon: "🟢" },
  GREEN_NEW: { tone: "positive", label: "New — Safe to Add", icon: "🟢" },
  YELLOW: { tone: "warning", label: "Needs Review", icon: "🟠" },
  CONFLICT: { tone: "negative", label: "Conflict", icon: "🔴" },
  MISSING: { tone: "muted", label: "Missing", icon: "⚪" },
};

type FieldSaveState = "idle" | "saving" | "saved" | "error" | "rejected";

const STATUS_OPTIONS = Object.values(STATUS_LABEL);
const CATEGORY_OPTIONS = Object.values(CATEGORY_LABEL);
const MONTH_OPTIONS = POSSESSION_MONTH_LABEL.filter(Boolean);

/**
 * Project Enrichment proposal table (Phase 28 Part I, field-level actions
 * added Phase 29 Part E, PERSISTED as of Phase 32 Part E, EDITABLE as of
 * Phase 36).
 *
 * Accept/Review/Accept Proposed call `onAcceptField`, which the parent
 * (ReviewQueueList.tsx) wires to `acceptEnrichmentFieldAction` -- this SAVES
 * the accepted value into the existing PENDING staging record's payload.
 * "Keep Current" for a CONFLICT field stays a pure client-side
 * acknowledgment -- nothing changes, so nothing is sent to the server.
 *
 * Phase 36: before accepting, the founder can click Edit to modify the
 * proposed value/items in LOCAL STATE ONLY (`editedValue`/`editedItems`
 * below) -- nothing is persisted until Accept is clicked, and Accept still
 * goes through the exact same `onAcceptField` -> acceptEnrichmentFieldAction
 * path, just with the edited value/items substituted for the source's
 * original proposal (a locally-modified copy of the `EnrichmentField` is
 * passed through the same existing callback signature -- no second
 * persistence action, no direct Prisma access from this component).
 *
 * This never touches the live Project and never approves/rejects the
 * staging record -- that remains the Review Queue's own separate Approve
 * button. Confirmation copy is deliberately "Saved to pending review", never
 * "Project updated" (Phase 32 Part P).
 */
export default function EnrichmentProposalPanel({
  fields,
  onAcceptField,
  onRejectField,
  onViewHistory,
  onUndo,
}: {
  fields: EnrichmentField[];
  onAcceptField: (field: EnrichmentField) => Promise<{ ok: boolean; error?: string }>;
  /** Targeted fix (post-Phase 71B founder testing) -- declines a proposed value with a required reason, recorded to the same enrichment history Accept/Undo already write to. Never applies the proposed value. */
  onRejectField: (field: EnrichmentField, reason: string) => Promise<{ ok: boolean; error?: string }>;
  onViewHistory: (fieldKey: string) => Promise<EnrichmentHistoryEntry[]>;
  onUndo: (fieldKey: string, historyEventId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [saveState, setSaveState] = useState<Record<string, FieldSaveState>>({});
  const [saveError, setSaveError] = useState<Record<string, string>>({});

  // Reject reason prompt -- local-only until "Confirm Rejection" is clicked.
  const [rejectingKey, setRejectingKey] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Phase 36 -- local-only edits, keyed by field.key. Never sent to the
  // server until the founder clicks Accept/Accept Proposed.
  const [editedValue, setEditedValue] = useState<Record<string, string>>({});
  const [editedItems, setEditedItems] = useState<Record<string, string[]>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  // Fixed once when editing starts -- never recomputed from the live draft,
  // so typing past the text/textarea length threshold can't swap the
  // control out from under the founder mid-edit.
  const [editKind, setEditKind] = useState<FieldEditorKind | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editDraftItems, setEditDraftItems] = useState<string[]>([]);
  // Targeted fix (Payment Plan -- one clean founder field) -- structured
  // name+description pairs for the "paymentPlans" field's own editor kind.
  // Kept separate from editDraftItems (plain strings) since the shape
  // differs; converted back to the SAME string[] shape only at Save Edit,
  // via formatPaymentPlanEntries -- the underlying payload/write path never
  // changes.
  const [paymentPlanDraft, setPaymentPlanDraft] = useState<PaymentPlanEntry[]>([]);
  const [editDraftError, setEditDraftError] = useState<string | null>(null);

  // Phase 37 -- which field's history dialog is open (null when closed),
  // and its fetched entries. Fetched fresh every time the dialog opens (and
  // again after a successful Undo) -- never cached across opens.
  const [historyFieldKey, setHistoryFieldKey] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<EnrichmentHistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function handleViewHistory(fieldKey: string) {
    setHistoryFieldKey(fieldKey);
    setHistoryLoading(true);
    setHistoryEntries(null);
    const entries = await onViewHistory(fieldKey);
    setHistoryEntries(entries);
    setHistoryLoading(false);
  }

  async function handleUndo(historyEventId: string): Promise<{ ok: boolean; error?: string }> {
    if (!historyFieldKey) return { ok: false, error: "No field open." };
    const result = await onUndo(historyFieldKey, historyEventId);
    if (result.ok) {
      // Re-fetch so the dialog immediately shows the fresh REVERT event at
      // the top instead of leaving the just-undone state on screen.
      setHistoryLoading(true);
      const entries = await onViewHistory(historyFieldKey);
      setHistoryEntries(entries);
      setHistoryLoading(false);
    }
    return result;
  }

  const byGroup = new Map<string, EnrichmentField[]>();
  for (const field of fields) {
    const group = byGroup.get(field.group) ?? [];
    group.push(field);
    byGroup.set(field.group, group);
  }

  // Targeted fix (real-time Review Queue synchronization) -- a field the
  // founder just Accepted/Saved/Rejected is resolved for this run (exactly
  // the same "no longer outstanding" rule the parent Review Queue card's own
  // badge already applies via enrichmentSummary.outstanding), so it's counted
  // as settled here too instead of staying in its original GREEN_NEW/YELLOW/
  // CONFLICT/MISSING bucket until the next explicit Enrich run. This never
  // rewrites field.classification itself (the per-row badge/history still
  // show exactly what happened) -- only this aggregate summary.
  const counts = fields.reduce(
    (acc, f) => {
      const state = saveState[f.key];
      const resolved = state === "saved" || state === "rejected";
      acc[resolved ? "CONFIRMED" : f.classification] += 1;
      return acc;
    },
    { CONFIRMED: 0, GREEN_NEW: 0, YELLOW: 0, CONFLICT: 0, MISSING: 0 } as Record<EnrichmentClassification, number>
  );

  /**
   * Phase 67: falls back to `currentValue` when there's no proposal at all
   * (the MISSING case -- e.g. RERA number already has a value but no new
   * source confirmed/changed it) so starting an edit seeds from what's
   * actually there today, not a blank field the founder has to retype from
   * scratch. Never changes anything for GREEN_NEW/YELLOW/CONFLICT/CONFIRMED,
   * which always carry a real proposedValue already.
   */
  function displayValue(field: EnrichmentField): string | null {
    return editedValue[field.key] ?? field.proposedValue ?? field.currentValue;
  }

  function displayItems(field: EnrichmentField): string[] | undefined {
    return editedItems[field.key] ?? field.proposedItems;
  }

  /**
   * Targeted fix (Payment Plan -- one clean founder field) -- "see the
   * resulting list immediately": once saved, the founder sees each plan's
   * actual name + description rather than a bare "N plan(s) listed" count.
   * Read-only display only; the editor above (renderEditor's
   * "payment-plan-list" branch) is what actually mutates this.
   */
  function renderPaymentPlanSummary(items: string[] | undefined) {
    const entries = parsePaymentPlanEntries(items);
    if (entries.length === 0) return <p className="text-foreground">—</p>;
    return (
      <ul className="flex flex-col gap-1">
        {entries.map((plan, i) => (
          <li key={i} className="break-words text-foreground">
            <span className="font-semibold">{plan.type || `Plan ${i + 1}`}</span>
            {plan.description ? <span className="text-muted"> — {plan.description}</span> : null}
          </li>
        ))}
      </ul>
    );
  }

  async function handleAccept(field: EnrichmentField) {
    setSaveState((prev) => ({ ...prev, [field.key]: "saving" }));
    // A locally-edited value/items, if any, rides through the SAME
    // onAcceptField -> acceptEnrichmentFieldAction path as an unedited one --
    // no new persistence action, no direct Prisma call from here.
    const fieldToAccept: EnrichmentField = { ...field, proposedValue: displayValue(field), proposedItems: displayItems(field) };
    const result = await onAcceptField(fieldToAccept);
    if (result.ok) {
      setSaveState((prev) => ({ ...prev, [field.key]: "saved" }));
    } else {
      setSaveState((prev) => ({ ...prev, [field.key]: "error" }));
      setSaveError((prev) => ({ ...prev, [field.key]: result.error ?? "Could not save this field." }));
    }
  }

  function startReject(fieldKey: string) {
    setRejectingKey(fieldKey);
    setRejectReason("");
    setRejectError(null);
  }

  function cancelReject() {
    setRejectingKey(null);
    setRejectReason("");
    setRejectError(null);
  }

  async function confirmReject(field: EnrichmentField) {
    if (!rejectReason.trim()) {
      setRejectError("A reason is required to reject this proposal.");
      return;
    }
    setRejectSubmitting(true);
    const fieldToReject: EnrichmentField = { ...field, proposedValue: displayValue(field), proposedItems: displayItems(field) };
    const result = await onRejectField(fieldToReject, rejectReason.trim());
    setRejectSubmitting(false);
    if (result.ok) {
      setSaveState((prev) => ({ ...prev, [field.key]: "rejected" }));
      setRejectingKey(null);
      setRejectReason("");
      setRejectError(null);
    } else {
      setRejectError(result.error ?? "Could not reject this proposal.");
    }
  }

  function startEdit(field: EnrichmentField) {
    const kind = getFieldEditorKind(field.key, (displayValue(field) ?? "").length);
    setEditKind(kind);
    if (kind === "payment-plan-list") {
      // Targeted fix (Payment Plan editor -- real data-loss bug found in
      // live verification): a CONFIRMED-by-omission field (no fresh source
      // fact this run) has no proposedItems at all, only a currentValue
      // count string ("2 plan(s) listed") -- seeding from displayItems()
      // alone would silently show a blank editor and DISCARD the founder's
      // real existing plans on save. field.currentItems (the real
      // underlying list) is the correct fallback whenever there's no fresh
      // proposal to edit instead.
      const items = displayItems(field) ?? field.currentItems;
      const entries = parsePaymentPlanEntries(items);
      setPaymentPlanDraft(entries.length > 0 ? entries : [{ type: "", description: "" }]);
    } else if (kind === "array") {
      const items = displayItems(field);
      setEditDraftItems(items && items.length > 0 ? [...items] : [displayValue(field) ?? ""]);
    } else {
      setEditDraft(displayValue(field) ?? "");
    }
    setEditDraftError(null);
    setEditingKey(field.key);
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditKind(null);
    setEditDraftError(null);
  }

  function saveEdit(field: EnrichmentField) {
    if (editKind === "payment-plan-list") {
      const cleaned = formatPaymentPlanEntries(paymentPlanDraft);
      if (cleaned.length === 0) {
        setEditDraftError("At least one payment plan (a name or a description) is required.");
        return;
      }
      setEditedItems((prev) => ({ ...prev, [field.key]: cleaned }));
      setEditedValue((prev) => ({ ...prev, [field.key]: cleaned.join(", ") }));
    } else if (editKind === "array") {
      const cleaned = editDraftItems.map((i) => i.trim()).filter(Boolean);
      if (cleaned.length === 0) {
        setEditDraftError("This field can't be saved empty.");
        return;
      }
      setEditedItems((prev) => ({ ...prev, [field.key]: cleaned }));
      setEditedValue((prev) => ({ ...prev, [field.key]: cleaned.join(", ") }));
    } else {
      const check = validateProposedEdit(field.key, editDraft);
      if (!check.ok) {
        setEditDraftError(check.error);
        return;
      }
      setEditedValue((prev) => ({ ...prev, [field.key]: editDraft.trim() }));
    }
    setEditingKey(null);
    setEditKind(null);
    setEditDraftError(null);
  }

  function renderEditor() {
    if (editKind === "payment-plan-list") {
      return (
        <div className="flex flex-col gap-2">
          {paymentPlanDraft.map((plan, i) => (
            <div key={i} className="flex flex-col gap-1 rounded-sm border border-border p-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-wide text-muted">Plan {i + 1}</span>
                <button
                  type="button"
                  onClick={() => setPaymentPlanDraft((prev) => prev.filter((_, idx) => idx !== i))}
                  className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-negative hover:text-negative"
                >
                  Remove
                </button>
              </div>
              <input
                type="text"
                value={plan.type}
                placeholder="Plan name (e.g. Construction Linked Plan)"
                onChange={(e) => setPaymentPlanDraft((prev) => prev.map((p, idx) => (idx === i ? { ...p, type: e.target.value } : p)))}
                className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-xs text-foreground"
              />
              <span className="text-[9px] uppercase tracking-wide text-muted">Description</span>
              <textarea
                value={plan.description}
                placeholder="e.g. Booking: 10% / Agreement: 80% / Possession: 10%"
                rows={2}
                onChange={(e) =>
                  setPaymentPlanDraft((prev) => prev.map((p, idx) => (idx === i ? { ...p, description: e.target.value } : p)))
                }
                className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-xs text-foreground"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPaymentPlanDraft((prev) => [...prev, { type: "", description: "" }])}
            className="w-fit rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-accent hover:text-accent"
          >
            + Add Payment Plan
          </button>
        </div>
      );
    }

    if (editKind === "array") {
      return (
        <div className="flex flex-col gap-1.5">
          {editDraftItems.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="text"
                value={item}
                onChange={(e) =>
                  setEditDraftItems((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                }
                className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-xs text-foreground"
              />
              <button
                type="button"
                onClick={() => setEditDraftItems((prev) => prev.filter((_, idx) => idx !== i))}
                className="rounded-sm border border-border px-1.5 py-1 text-[10px] font-mono uppercase text-muted hover:border-negative hover:text-negative"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setEditDraftItems((prev) => [...prev, ""])}
            className="w-fit rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-accent hover:text-accent"
          >
            + Add item
          </button>
        </div>
      );
    }

    if (editKind === "enum-status") {
      return (
        <select
          value={editDraft}
          onChange={(e) => setEditDraft(e.target.value)}
          className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-xs text-foreground"
        >
          {STATUS_OPTIONS.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      );
    }

    if (editKind === "enum-category") {
      return (
        <select
          value={editDraft}
          onChange={(e) => setEditDraft(e.target.value)}
          className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-xs text-foreground"
        >
          {CATEGORY_OPTIONS.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      );
    }

    if (editKind === "month") {
      return (
        <select
          value={editDraft}
          onChange={(e) => setEditDraft(e.target.value)}
          className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-xs text-foreground"
        >
          {MONTH_OPTIONS.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      );
    }

    if (editKind === "textarea") {
      return (
        <textarea
          value={editDraft}
          onChange={(e) => setEditDraft(e.target.value)}
          rows={4}
          className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-xs text-foreground"
        />
      );
    }

    return (
      <input
        type="text"
        value={editDraft}
        onChange={(e) => setEditDraft(e.target.value)}
        className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-xs text-foreground"
      />
    );
  }

  function statusLine(fieldKey: string) {
    const state = saveState[fieldKey];
    if (state === "saving") return <span className="text-[10px] text-muted">Saving...</span>;
    if (state === "saved") return <span className="text-[10px] text-positive">✓ Saved to pending review</span>;
    if (state === "rejected") return <span className="text-[10px] text-muted">✓ Rejected — recorded to history, current value kept</span>;
    if (state === "error") return <span className="text-[10px] text-negative">{saveError[fieldKey]}</span>;
    return null;
  }

  function renderRejectPrompt(field: EnrichmentField) {
    return (
      <div className="mt-1.5 flex flex-col gap-1.5 rounded-sm border border-negative/30 bg-negative/5 p-2">
        <p className="text-[10px] font-mono uppercase tracking-wide text-negative">Reject Enrichment Proposal</p>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted">Reason</span>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={2}
            className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-xs text-foreground"
            placeholder="Why is this proposed value being declined?"
          />
        </label>
        {rejectError ? <span className="text-[10px] text-negative">{rejectError}</span> : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={rejectSubmitting}
            onClick={() => confirmReject(field)}
            className="rounded-sm border border-negative/40 px-2 py-0.5 text-[10px] font-mono uppercase text-negative hover:bg-negative/10 disabled:opacity-50"
          >
            {rejectSubmitting ? "Confirming..." : "Confirm Rejection"}
          </button>
          <button
            type="button"
            disabled={rejectSubmitting}
            onClick={cancelReject}
            className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-foreground hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3 text-[11px]">
        <span className="text-positive">🟢 {counts.CONFIRMED} Confirmed</span>
        <span className="text-positive">🟢 {counts.GREEN_NEW} New (Safe)</span>
        <span className="text-warning">🟠 {counts.YELLOW} Needs Review</span>
        <span className="text-negative">🔴 {counts.CONFLICT} Conflict</span>
        <span className="text-muted">⚪ {counts.MISSING} Missing</span>
      </div>

      <p className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-[10px] text-muted">
        Accepting a field saves it to this project&apos;s pending review record only — the live project listing is unaffected until you use the Review
        Queue&apos;s own Approve button. Edited values are kept in this view only until you click Accept.
      </p>

      {[...byGroup.entries()].map(([group, groupFields]) => (
        <div key={group}>
          <p className="mb-1.5 text-[10px] font-mono uppercase tracking-wide text-muted">{group}</p>
          <div className="flex flex-col divide-y divide-border rounded-sm border border-border">
            {groupFields.map((field) => {
              const state = saveState[field.key] ?? "idle";
              const busy = state === "saving";
              const done = state === "saved" || state === "rejected";
              const isEditing = editingKey === field.key;
              const isRejecting = rejectingKey === field.key;
              // Phase 67: gates on whether applyAcceptedField can actually write this
              // key at all (excludes locality/builder/slug/dataSource/sourceRef),
              // independent of classification -- including MISSING, so a field like
              // RERA number that already has a value but no new source confirmed it
              // still gets an Edit path, not just View History.
              const canEdit = isFieldManuallyEditable(field.key);
              return (
                <div key={field.key} className="flex flex-col gap-1 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-muted">{field.label}</span>
                    <Badge tone={CLASSIFICATION_BADGE[field.classification].tone}>
                      {CLASSIFICATION_BADGE[field.classification].icon} {CLASSIFICATION_BADGE[field.classification].label}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-wide text-muted">Current</p>
                      <p className="break-words text-foreground">{field.currentValue ?? "—"}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-wide text-muted">Proposed</p>
                      {isEditing ? (
                        <div className="mt-1 flex flex-col gap-1">
                          {renderEditor()}
                          {editDraftError ? <span className="text-[10px] text-negative">{editDraftError}</span> : null}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => saveEdit(field)}
                              className="rounded-sm border border-positive/40 px-2 py-0.5 text-[10px] font-mono uppercase text-positive hover:bg-positive/10"
                            >
                              Save Edit
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-foreground hover:text-foreground"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : field.key === "paymentPlans" ? (
                        renderPaymentPlanSummary(displayItems(field) ?? field.currentItems)
                      ) : (
                        <p className="break-words text-foreground">{displayValue(field) ?? "—"}</p>
                      )}
                    </div>
                  </div>
                  {field.sourceUrl ? (
                    <p className="break-words text-[10px] text-muted">
                      Source: {field.sourceType ? SOURCE_TIER_LABEL[field.sourceType] : "Unknown"} · {field.sourceUrl}
                      {field.confidence ? ` · Confidence: ${field.confidence}` : ""}
                    </p>
                  ) : null}
                  <p className="text-[10px] text-muted">{field.reason}</p>

                  {!isEditing && !isRejecting && field.classification === "GREEN_NEW" ? (
                    <div className="mt-1 flex items-center gap-2">
                      {canEdit ? (
                        <button
                          type="button"
                          disabled={busy || done}
                          onClick={() => startEdit(field)}
                          className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          Edit
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy || done}
                        onClick={() => handleAccept(field)}
                        className="rounded-sm border border-positive/40 px-2 py-0.5 text-[10px] font-mono uppercase text-positive hover:bg-positive/10 disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={busy || done}
                        onClick={() => startReject(field.key)}
                        className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-negative hover:text-negative disabled:opacity-50"
                      >
                        Reject
                      </button>
                      {statusLine(field.key)}
                      <button
                        type="button"
                        onClick={() => handleViewHistory(field.key)}
                        className="ml-auto rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-accent hover:text-accent"
                      >
                        View History
                      </button>
                    </div>
                  ) : null}

                  {!isEditing && !isRejecting && field.classification === "YELLOW" ? (
                    <div className="mt-1 flex items-center gap-2">
                      {canEdit ? (
                        <button
                          type="button"
                          disabled={busy || done}
                          onClick={() => startEdit(field)}
                          className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          Edit
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy || done}
                        onClick={() => handleAccept(field)}
                        className="rounded-sm border border-warning/40 px-2 py-0.5 text-[10px] font-mono uppercase text-warning hover:bg-warning/10 disabled:opacity-50"
                        title="This value is source-backed but lower confidence -- you're accepting it despite that."
                      >
                        Accept (lower confidence)
                      </button>
                      <button
                        type="button"
                        disabled={busy || done}
                        onClick={() => startReject(field.key)}
                        className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-negative hover:text-negative disabled:opacity-50"
                      >
                        Reject
                      </button>
                      {statusLine(field.key)}
                      <button
                        type="button"
                        onClick={() => handleViewHistory(field.key)}
                        className="ml-auto rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-accent hover:text-accent"
                      >
                        View History
                      </button>
                    </div>
                  ) : null}

                  {!isEditing && !isRejecting && field.classification === "CONFLICT" ? (
                    <div className="mt-1 flex items-center gap-2">
                      {canEdit ? (
                        <button
                          type="button"
                          disabled={busy || done}
                          onClick={() => startEdit(field)}
                          className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          Edit
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy || done}
                        onClick={() => handleAccept(field)}
                        className="rounded-sm border border-negative/40 px-2 py-0.5 text-[10px] font-mono uppercase text-negative hover:bg-negative/10 disabled:opacity-50"
                      >
                        Accept Proposed
                      </button>
                      <button
                        type="button"
                        disabled={busy || done}
                        onClick={() => startReject(field.key)}
                        className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-foreground hover:text-foreground disabled:opacity-50"
                      >
                        Reject
                      </button>
                      {statusLine(field.key)}
                      <button
                        type="button"
                        onClick={() => handleViewHistory(field.key)}
                        className="ml-auto rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-accent hover:text-accent"
                      >
                        View History
                      </button>
                    </div>
                  ) : null}

                  {isRejecting ? renderRejectPrompt(field) : null}

                  {!isEditing && field.classification === "CONFIRMED" ? (
                    <div className="mt-1 flex items-center gap-2">
                      {canEdit ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => startEdit(field)}
                          className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          Edit
                        </button>
                      ) : null}
                      {/* Targeted fix (Slug editability -- surfaced this same gap for
                          every CONFIRMED, editable field): "Save Edit" only stages the
                          new value in local state; without this button there was no way
                          to actually persist a CONFIRMED field's edit (unlike GREEN_NEW/
                          YELLOW/CONFLICT, which already have an Accept button, and MISSING,
                          which already has its own equivalent Save button below). */}
                      {canEdit && editedValue[field.key] !== undefined ? (
                        <button
                          type="button"
                          disabled={busy || done}
                          onClick={() => handleAccept(field)}
                          className="rounded-sm border border-positive/40 px-2 py-0.5 text-[10px] font-mono uppercase text-positive hover:bg-positive/10 disabled:opacity-50"
                        >
                          Save
                        </button>
                      ) : null}
                      {statusLine(field.key)}
                      <button
                        type="button"
                        onClick={() => handleViewHistory(field.key)}
                        className="ml-auto rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-accent hover:text-accent"
                      >
                        View History
                      </button>
                    </div>
                  ) : null}

                  {!isEditing && field.classification === "MISSING" ? (
                    <div className="mt-1 flex items-center gap-2">
                      {canEdit ? (
                        <button
                          type="button"
                          disabled={busy || done}
                          onClick={() => startEdit(field)}
                          className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          Edit
                        </button>
                      ) : null}
                      {/* Only offer Save once the founder has actually typed something --
                          there's no source proposal to accept as-is for a MISSING field. */}
                      {canEdit && editedValue[field.key] !== undefined ? (
                        <button
                          type="button"
                          disabled={busy || done}
                          onClick={() => handleAccept(field)}
                          className="rounded-sm border border-positive/40 px-2 py-0.5 text-[10px] font-mono uppercase text-positive hover:bg-positive/10 disabled:opacity-50"
                        >
                          Save
                        </button>
                      ) : null}
                      {statusLine(field.key)}
                      <button
                        type="button"
                        onClick={() => handleViewHistory(field.key)}
                        className="ml-auto rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-accent hover:text-accent"
                      >
                        View History
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {historyFieldKey ? (
        <EnrichmentFieldHistoryDialog
          fieldLabel={fields.find((f) => f.key === historyFieldKey)?.label ?? historyFieldKey}
          entries={historyEntries}
          loading={historyLoading}
          onClose={() => {
            setHistoryFieldKey(null);
            setHistoryEntries(null);
          }}
          onUndo={handleUndo}
        />
      ) : null}
    </div>
  );
}
