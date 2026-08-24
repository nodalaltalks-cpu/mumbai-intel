"use client";

import { useActionState, useRef, useState } from "react";
import { removeProjectFloorPlanAction, uploadProjectFloorPlanAction, type FloorPlanActionState } from "@/lib/actions/project-floor-plan";
import { compressPdfFile } from "@/lib/pdf-compress";
import { formatBytes, formatDate } from "@/lib/format";
import Dialog from "@/app/components/ui/Dialog";
import ConfirmButton from "./ConfirmButton";
import SubmitButton from "./SubmitButton";

const initialState: FloorPlanActionState = {};

type CompressionStatus =
  | { status: "idle" }
  | { status: "compressing" }
  | { status: "done"; compressed: boolean; originalBytes: number; compressedBytes: number };

/** Optional single-slot PDF upload — same client-side auto-compression as BrochureUploader (lib/pdf-compress.ts), same upload/replace/remove pattern, reused rather than duplicated. */
export default function FloorPlanUploader({
  projectId,
  floorPlanUrl,
  floorPlanUploadedAt,
}: {
  projectId: string;
  floorPlanUrl: string | null;
  floorPlanUploadedAt: Date | null;
}) {
  const action = uploadProjectFloorPlanAction.bind(null, projectId);
  const [state, formAction] = useActionState(action, initialState);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compression, setCompression] = useState<CompressionStatus>({ status: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) {
      setCompression({ status: "idle" });
      return;
    }
    setCompression({ status: "compressing" });
    const result = await compressPdfFile(selected);
    if (result.compressed && fileInputRef.current) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(result.file);
      fileInputRef.current.files = dataTransfer.files;
    }
    setCompression({ status: "done", compressed: result.compressed, originalBytes: result.originalBytes, compressedBytes: result.compressedBytes });
  }

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Floor Plan</h3>
      <p className="mt-1 text-xs text-muted">Optional — a PDF floor plan attached to this project. PDFs are optimized automatically for storage efficiency.</p>

      {floorPlanUrl ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-sm border border-border bg-background px-3 py-2">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-foreground">Floor Plan.pdf</p>
            <p className="text-[10px] text-muted">{floorPlanUploadedAt ? `Uploaded ${formatDate(floorPlanUploadedAt)}` : null}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPreviewUrl(floorPlanUrl)}
              className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
            >
              Preview
            </button>
            <ConfirmButton action={removeProjectFloorPlanAction.bind(null, projectId)} label="Remove" />
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">No floor plan uploaded yet.</p>
      )}

      <form action={formAction} className="mt-3">
        <fieldset disabled={compression.status === "compressing"} className="flex items-end gap-3 border-0 p-0">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-muted">{floorPlanUrl ? "Replace with new PDF" : "Choose PDF"}</span>
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              accept="application/pdf"
              required
              onChange={handleFileChange}
              className="rounded-sm border border-border bg-surface px-3 py-2 text-xs text-foreground file:mr-3 file:rounded-sm file:border-0 file:bg-accent file:px-2.5 file:py-1 file:text-xs file:font-mono file:font-semibold file:uppercase file:text-white disabled:opacity-60"
            />
          </label>
          <SubmitButton pendingText="Uploading...">{compression.status === "compressing" ? "Optimizing PDF…" : floorPlanUrl ? "Replace" : "Upload"}</SubmitButton>
        </fieldset>
        {compression.status === "compressing" ? (
          <p className="mt-1.5 text-[11px] text-muted">Optimizing PDF…</p>
        ) : compression.status === "done" && compression.compressed ? (
          <p className="mt-1.5 text-[11px] text-positive">
            PDF optimized and ready to upload: {formatBytes(compression.originalBytes)} → {formatBytes(compression.compressedBytes)}.
          </p>
        ) : null}
      </form>
      {state.error ? (
        <p className="mt-2 rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">{state.error}</p>
      ) : null}

      {previewUrl ? (
        <Dialog title="Floor plan preview" onClose={() => setPreviewUrl(null)} maxWidth="max-w-3xl">
          <iframe src={previewUrl} title="Floor plan preview" className="h-[70vh] w-full rounded-sm border border-border" />
        </Dialog>
      ) : null}
    </div>
  );
}
