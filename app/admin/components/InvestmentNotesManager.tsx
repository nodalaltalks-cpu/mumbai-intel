"use client";

import { useActionState } from "react";
import { addInvestmentNoteAction, deleteInvestmentNoteAction } from "@/lib/actions/investment-notes";
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

const KIND_LABEL: Record<string, string> = { summary: "Summary", pro: "Pro", con: "Con" };

function NoteGroup({ title, notes }: { title: string; notes: InvestmentNoteRow[] }) {
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
              <ConfirmButton action={deleteInvestmentNoteAction.bind(null, note.id)} />
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
  const action = addInvestmentNoteAction.bind(null, projectId);
  const [state, formAction] = useActionState(action, { error: undefined });

  const summaries = notes.filter((n) => n.kind === "summary");
  const pros = notes.filter((n) => n.kind === "pro");
  const cons = notes.filter((n) => n.kind === "con");

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Investment Notes</h3>
      <p className="mt-1 text-xs text-muted">
        Summary and pros/cons shown as the project&apos;s investment snapshot. Every note carries a data source and confidence
        level — nothing renders publicly without a named origin.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NoteGroup title="Summary" notes={summaries} />
        <NoteGroup title="Pros" notes={pros} />
        <NoteGroup title="Cons" notes={cons} />
      </div>

      <form action={formAction} className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SelectField label="Kind" name="kind" defaultValue="summary" required>
            {(["summary", "pro", "con"] as const).map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABEL[kind]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Data Source" name="dataSource" defaultValue="MANUALLY_VERIFIED" required>
            {DATA_SOURCES.map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABEL[source]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Confidence" name="confidence" defaultValue="MEDIUM" required>
            {CONFIDENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {CONFIDENCE_LABEL[level]}
              </option>
            ))}
          </SelectField>
        </div>
        <TextareaField label="Body" name="body" placeholder="e.g. Strong rental demand due to proximity to the upcoming metro line." required />
        <div>
          <SubmitButton pendingText="Adding...">Add Note</SubmitButton>
        </div>
      </form>
      {state.error ? <p className="mt-2 text-xs text-negative">{state.error}</p> : null}
    </div>
  );
}
