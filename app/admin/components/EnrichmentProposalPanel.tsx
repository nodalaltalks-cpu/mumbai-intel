"use client";

import { useState } from "react";
import Badge, { type BadgeTone } from "@/app/components/ui/Badge";
import type { EnrichmentClassification, EnrichmentField } from "@/lib/enrichment/types";
import { SOURCE_TIER_LABEL } from "@/lib/enrichment/types";
import { getFieldEditorKind, validateProposedEdit, type FieldEditorKind } from "@/lib/enrichment/applyAcceptedField";
import { CATEGORY_LABEL, POSSESSION_MONTH_LABEL, STATUS_LABEL } from "@/lib/project-meta";

const CLASSIFICATION_BADGE: Record<EnrichmentClassification, { tone: BadgeTone; label: string; icon: string }> = {
  CONFIRMED: { tone: "positive", label: "Confirmed", icon: "🟢" },
  GREEN_NEW: { tone: "positive", label: "New — Safe to Add", icon: "🟢" },
  YELLOW: { tone: "warning", label: "Needs Review", icon: "🟠" },
  CONFLICT: { tone: "negative", label: "Conflict", icon: "🔴" },
  MISSING: { tone: "muted", label: "Missing", icon: "⚪" },
};

type FieldSaveState = "idle" | "saving" | "saved" | "error" | "kept";

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
}: {
  fields: EnrichmentField[];
  onAcceptField: (field: EnrichmentField) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [saveState, setSaveState] = useState<Record<string, FieldSaveState>>({});
  const [saveError, setSaveError] = useState<Record<string, string>>({});

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
  const [editDraftError, setEditDraftError] = useState<string | null>(null);

  const byGroup = new Map<string, EnrichmentField[]>();
  for (const field of fields) {
    const group = byGroup.get(field.group) ?? [];
    group.push(field);
    byGroup.set(field.group, group);
  }

  const counts = fields.reduce(
    (acc, f) => {
      acc[f.classification] += 1;
      return acc;
    },
    { CONFIRMED: 0, GREEN_NEW: 0, YELLOW: 0, CONFLICT: 0, MISSING: 0 } as Record<EnrichmentClassification, number>
  );

  function displayValue(field: EnrichmentField): string | null {
    return editedValue[field.key] ?? field.proposedValue;
  }

  function displayItems(field: EnrichmentField): string[] | undefined {
    return editedItems[field.key] ?? field.proposedItems;
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

  function handleKeepCurrent(fieldKey: string) {
    setSaveState((prev) => ({ ...prev, [fieldKey]: "kept" }));
  }

  function startEdit(field: EnrichmentField) {
    const kind = getFieldEditorKind(field.key, (displayValue(field) ?? "").length);
    setEditKind(kind);
    if (kind === "array") {
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
    if (editKind === "array") {
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
    if (state === "kept") return <span className="text-[10px] text-muted">Keeping current value — no change made</span>;
    if (state === "error") return <span className="text-[10px] text-negative">{saveError[fieldKey]}</span>;
    return null;
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
              const done = state === "saved" || state === "kept";
              const isEditing = editingKey === field.key;
              const canEdit = field.proposedValue !== null && (field.classification === "GREEN_NEW" || field.classification === "YELLOW" || field.classification === "CONFLICT");
              return (
                <div key={field.key} className="flex flex-col gap-1 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-muted">{field.label}</span>
                    <Badge tone={CLASSIFICATION_BADGE[field.classification].tone}>
                      {CLASSIFICATION_BADGE[field.classification].icon} {CLASSIFICATION_BADGE[field.classification].label}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] uppercase tracking-wide text-muted">Current</p>
                      <p className="text-foreground">{field.currentValue ?? "—"}</p>
                    </div>
                    <div>
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
                      ) : (
                        <p className="text-foreground">{displayValue(field) ?? "—"}</p>
                      )}
                    </div>
                  </div>
                  {field.sourceUrl ? (
                    <p className="text-[10px] text-muted">
                      Source: {field.sourceType ? SOURCE_TIER_LABEL[field.sourceType] : "Unknown"} · {field.sourceUrl}
                      {field.confidence ? ` · Confidence: ${field.confidence}` : ""}
                    </p>
                  ) : null}
                  <p className="text-[10px] text-muted">{field.reason}</p>

                  {!isEditing && field.classification === "GREEN_NEW" ? (
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
                      {statusLine(field.key)}
                    </div>
                  ) : null}

                  {!isEditing && field.classification === "YELLOW" ? (
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
                      {statusLine(field.key)}
                    </div>
                  ) : null}

                  {!isEditing && field.classification === "CONFLICT" ? (
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy || done}
                        onClick={() => handleKeepCurrent(field.key)}
                        className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-foreground hover:text-foreground disabled:opacity-50"
                      >
                        Keep Current
                      </button>
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
                      {statusLine(field.key)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
