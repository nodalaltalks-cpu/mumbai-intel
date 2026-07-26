"use client";

import { useActionState } from "react";
import { removeProjectBrochureAction, uploadProjectBrochureAction, type BrochureActionState } from "@/lib/actions/brochure";
import ConfirmButton from "./ConfirmButton";
import SubmitButton from "./SubmitButton";

const initialState: BrochureActionState = {};

function fileNameFromUrl(url: string): string {
  const decoded = decodeURIComponent(url);
  const parts = decoded.split("/");
  return parts[parts.length - 1] || "brochure.pdf";
}

export default function BrochureUploader({ projectId, brochureUrl }: { projectId: string; brochureUrl: string | null }) {
  const action = uploadProjectBrochureAction.bind(null, projectId);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Brochure</h3>
      <p className="mt-1 text-xs text-muted">A single PDF brochure attached to this project (max 15MB).</p>

      {brochureUrl ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-sm border border-border bg-background px-3 py-2">
          <a
            href={brochureUrl}
            target="_blank"
            rel="noreferrer"
            className="truncate font-mono text-xs text-accent hover:underline"
          >
            {fileNameFromUrl(brochureUrl)}
          </a>
          <ConfirmButton action={removeProjectBrochureAction.bind(null, projectId)} label="Remove" />
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">No brochure uploaded yet.</p>
      )}

      <form action={formAction} className="mt-3 flex items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted">
            {brochureUrl ? "Replace with new PDF" : "Upload PDF"}
          </span>
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
      {state.error ? (
        <p className="mt-2 rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
