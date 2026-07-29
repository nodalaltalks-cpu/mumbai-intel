"use client";

import { useActionState, useState } from "react";
import {
  removeBrochureThumbnailAction,
  removeProjectBrochureAction,
  uploadBrochureThumbnailAction,
  uploadProjectBrochureAction,
  type BrochureActionState,
} from "@/lib/actions/brochure";
import type { BrochureVersionItem } from "@/lib/admin-queries";
import { formatBytes, formatDate } from "@/lib/format";
import Dialog from "@/app/components/ui/Dialog";
import ConfirmButton from "./ConfirmButton";
import SubmitButton from "./SubmitButton";

const initialState: BrochureActionState = {};

export default function BrochureUploader({
  projectId,
  brochureUrl,
  brochureFileName,
  brochureFileSize,
  brochureUploadedAt,
  brochureThumbnailUrl,
  versions,
  isAdmin,
  maxSizeMB,
}: {
  projectId: string;
  brochureUrl: string | null;
  brochureFileName: string | null;
  brochureFileSize: number | null;
  brochureUploadedAt: Date | null;
  brochureThumbnailUrl: string | null;
  versions: BrochureVersionItem[];
  isAdmin: boolean;
  maxSizeMB: number;
}) {
  const action = uploadProjectBrochureAction.bind(null, projectId);
  const [state, formAction] = useActionState(action, initialState);
  const thumbnailAction = uploadBrochureThumbnailAction.bind(null, projectId);
  const [thumbnailState, thumbnailFormAction] = useActionState(thumbnailAction, initialState);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Brochure</h3>
      <p className="mt-1 text-xs text-muted">A PDF brochure attached to this project (max {maxSizeMB}MB).</p>

      {brochureUrl ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-sm border border-border bg-background px-3 py-2">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-foreground">{brochureFileName ?? "brochure.pdf"}</p>
            <p className="text-[10px] text-muted">
              {formatBytes(brochureFileSize)} · Uploaded {brochureUploadedAt ? formatDate(brochureUploadedAt) : "--"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPreviewUrl(brochureUrl)}
              className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
            >
              Preview
            </button>
            {isAdmin ? <ConfirmButton action={removeProjectBrochureAction.bind(null, projectId)} label="Remove" /> : null}
          </div>
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
        <SubmitButton pendingText="Uploading...">{brochureUrl ? "Replace" : "Upload"}</SubmitButton>
      </form>
      {state.error ? (
        <p className="mt-2 rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">
          {state.error}
        </p>
      ) : null}

      {versions.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="font-mono text-[11px] uppercase tracking-wide text-muted hover:text-accent"
          >
            {showHistory ? "Hide" : "Show"} version history ({versions.length})
          </button>
          {showHistory ? (
            <div className="mt-2 overflow-x-auto rounded-sm border border-border">
              <table className="w-full min-w-[480px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                    <th className="px-2.5 py-1.5 font-medium">Version</th>
                    <th className="px-2.5 py-1.5 font-medium">File</th>
                    <th className="px-2.5 py-1.5 font-medium">Size</th>
                    <th className="px-2.5 py-1.5 font-medium">Uploaded</th>
                    <th className="px-2.5 py-1.5 font-medium">By</th>
                    <th className="px-2.5 py-1.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.id} className="border-b border-border last:border-b-0">
                      <td className="px-2.5 py-1.5 font-mono text-foreground">
                        v{v.version}
                        {v.isCurrent ? (
                          <span className="ml-1.5 rounded-sm border border-positive/40 bg-positive/10 px-1 py-0.5 text-[9px] uppercase text-positive">
                            Current
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-[160px] truncate px-2.5 py-1.5 text-muted">{v.fileName}</td>
                      <td className="px-2.5 py-1.5 text-muted">{formatBytes(v.fileSize)}</td>
                      <td className="px-2.5 py-1.5 text-muted">{formatDate(v.uploadedAt)}</td>
                      <td className="px-2.5 py-1.5 text-muted">{v.uploadedByName ?? "--"}</td>
                      <td className="px-2.5 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => setPreviewUrl(v.url)}
                          className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                        >
                          Preview
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 border-t border-border pt-3">
        <h4 className="font-mono text-xs font-semibold text-foreground">Brochure Thumbnail</h4>
        <p className="mt-1 text-[11px] text-muted">
          The clickable preview image shown with the Download Brochure card on the public site.
        </p>

        {!brochureUrl ? (
          <p className="mt-2 text-xs text-muted">Upload a brochure first to enable a thumbnail.</p>
        ) : (
          <>
            {brochureThumbnailUrl ? (
              <div className="mt-2 flex items-center gap-3 rounded-sm border border-border bg-background px-3 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={brochureThumbnailUrl}
                  alt="Brochure thumbnail"
                  className="h-16 w-16 rounded-sm border border-border object-cover"
                />
                <p className="flex-1 text-[11px] text-muted">Shown on the project page and brochure download card.</p>
                {isAdmin ? <ConfirmButton action={removeBrochureThumbnailAction.bind(null, projectId)} label="Remove" /> : null}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted">No thumbnail uploaded yet.</p>
            )}

            <form action={thumbnailFormAction} className="mt-3 flex items-end gap-3">
              <label className="flex flex-1 flex-col gap-1.5">
                <span className="text-[11px] uppercase tracking-wide text-muted">
                  {brochureThumbnailUrl ? "Replace thumbnail" : "Upload thumbnail"}
                </span>
                <input
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  required
                  className="rounded-sm border border-border bg-surface px-3 py-2 text-xs text-foreground file:mr-3 file:rounded-sm file:border-0 file:bg-accent file:px-2.5 file:py-1 file:text-xs file:font-mono file:font-semibold file:uppercase file:text-white"
                />
              </label>
              <SubmitButton pendingText="Uploading...">{brochureThumbnailUrl ? "Replace" : "Upload"}</SubmitButton>
            </form>
            {thumbnailState.error ? (
              <p className="mt-2 rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">
                {thumbnailState.error}
              </p>
            ) : null}
          </>
        )}
      </div>

      {previewUrl ? (
        <Dialog title="Brochure preview" onClose={() => setPreviewUrl(null)} maxWidth="max-w-3xl">
          <iframe src={previewUrl} title="Brochure preview" className="h-[70vh] w-full rounded-sm border border-border" />
        </Dialog>
      ) : null}
    </div>
  );
}
