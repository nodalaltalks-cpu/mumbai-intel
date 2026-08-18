"use client";

import { useActionState, useState } from "react";
import { addInvestmentNoteAction, deleteInvestmentNoteAction, updateInvestmentNoteAction } from "@/lib/actions/investment-notes";
import { SelectField, TextareaField } from "./FormField";
import SubmitButton from "./SubmitButton";
import ConfirmButton from "./ConfirmButton";
import { DATA_SOURCES, CONFIDENCE_LEVELS, SOURCE_LABEL, CONFIDENCE_LABEL, type DataSource, type Confidence } from "@/lib/project-meta";

export interface InvestmentNoteRow {
  id: string;
  kind: string;
  body: string;
  dataSource: DataSource;
  confidence: Confidence;
}

function NoteGroup({
  title,
  notes,
  onEdit,
}: {
  title: string;
  notes: InvestmentNoteRow[];
  onEdit: (note: InvestmentNoteRow) => void;
}) {
  return (
    <div>
      <h4 className="text-[11px] uppercase tracking-wide text-muted">{title}</h4>
      {notes.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note.id} className="flex items-start justify-between gap-2 border-t border-border pt-2 first:border-t-0">
              <div>
                <p className="text-xs text-foreground">{note.body}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted">
                  {SOURCE_LABEL[note.dataSource]} &middot; {CONFIDENCE_LABEL[note.confidence]} confidence
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(note)}
                  className="text-[11px] font-mono uppercase tracking-wide text-accent hover:underline"
                >
                  Edit
                </button>
                <ConfirmButton action={deleteInvestmentNoteAction.bind(null, note.id)} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted">None yet.</p>
      )}
    </div>
  );
}

export default function InvestmentNotesManager({ projectId, notes }: { projectId: string; notes: InvestmentNoteRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRow = notes.find((n) => n.id === editingId) ?? null;

  const action = editingId ? updateInvestmentNoteAction.bind(null, editingId, projectId) : addInvestmentNoteAction.bind(null, projectId);
  const [state, formAction] = useActionState(action, { error: undefined });

  const pros = notes.filter((n) => n.kind === "pro");
  const cons = notes.filter((n) => n.kind === "con");

  function startEdit(note: InvestmentNoteRow) {
    setEditingId(note.id);
  }
  function cancelEdit() {
    setEditingId(null);
  }

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Investment Notes</h3>
      <p className="mt-1 text-xs text-muted">
        Pros/cons shown as the project&apos;s investment snapshot. Every note carries a data source and confidence
        level — nothing renders publicly without a named origin.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NoteGroup title="Pros" notes={pros} onEdit={startEdit} />
        <NoteGroup title="Cons" notes={cons} onEdit={startEdit} />
      </div>

      <form key={editingId ?? "new"} action={formAction} className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SelectField label="Kind" name="kind" defaultValue={editingRow?.kind ?? "pro"} required>
            {(["pro", "con"] as const).map((kind) => (
              <option key={kind} value={kind}>
                {kind === "pro" ? "Pro" : "Con"}
              </option>
            ))}
          </SelectField>
          <SelectField label="Data Source" name="dataSource" defaultValue={editingRow?.dataSource ?? "MANUALLY_VERIFIED"} required>
            {DATA_SOURCES.map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABEL[source]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Confidence" name="confidence" defaultValue={editingRow?.confidence ?? "MEDIUM"} required>
            {CONFIDENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {CONFIDENCE_LABEL[level]}
              </option>
            ))}
          </SelectField>
        </div>
        <TextareaField
          label="Body"
          name="body"
          placeholder="e.g. Strong rental demand due to proximity to the upcoming metro line."
          required
          defaultValue={editingRow?.body ?? ""}
        />
        <div className="flex gap-2">
          <SubmitButton pendingText={editingId ? "Saving..." : "Adding..."}>{editingId ? "Save changes" : "Add Note"}</SubmitButton>
          {editingId ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-sm border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-negative hover:text-negative"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
      {state.error ? <p className="mt-2 text-xs text-negative">{state.error}</p> : null}
    </div>
  );
}
