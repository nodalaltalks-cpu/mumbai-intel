"use client";

import { useActionState } from "react";
import { addProjectDocumentAction, deleteProjectDocumentAction, type DocumentActionState } from "@/lib/actions/project-documents";
import { Field } from "./FormField";
import SubmitButton from "./SubmitButton";
import ConfirmButton from "./ConfirmButton";

export interface ProjectDocumentRow {
  id: string;
  title: string;
  url: string;
}

const initialState: DocumentActionState = {};

export default function DocumentsManager({ projectId, documents }: { projectId: string; documents: ProjectDocumentRow[] }) {
  const action = addProjectDocumentAction.bind(null, projectId);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Documents</h3>
      <p className="mt-1 text-xs text-muted">Approvals, legal title, extra plan sheets — PDFs beyond the primary brochure.</p>

      {documents.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-2 rounded-sm border border-border bg-background px-3 py-2">
              <a href={doc.url} target="_blank" rel="noreferrer" className="truncate font-mono text-xs text-accent hover:underline">
                {doc.title}
              </a>
              <ConfirmButton action={deleteProjectDocumentAction.bind(null, doc.id)} label="Remove" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted">No documents uploaded yet.</p>
      )}

      <form action={formAction} className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Title" name="title" placeholder="MahaRERA approval letter" required />
        </div>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted">PDF file</span>
          <input
            type="file"
            name="file"
            accept="application/pdf"
            required
            className="rounded-sm border border-border bg-surface px-3 py-2 text-xs text-foreground file:mr-3 file:rounded-sm file:border-0 file:bg-accent file:px-2.5 file:py-1 file:text-xs file:font-mono file:font-semibold file:uppercase file:text-white"
          />
        </label>
        <SubmitButton pendingText="Uploading...">Upload</SubmitButton>
      </form>
      {state.error ? <p className="mt-2 text-xs text-negative">{state.error}</p> : null}
    </div>
  );
}
