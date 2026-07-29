"use client";

import { useRef, useState, type DragEvent } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { addProjectImageAction, deleteProjectImageAction, reorderProjectImageAction, type ImageActionState } from "@/lib/actions/images";
import { IMAGE_KINDS } from "@/lib/project-meta";
import ConfirmButton from "./ConfirmButton";
import SubmitButton from "./SubmitButton";

export interface ProjectImageItem {
  id: string;
  url: string;
  alt: string | null;
  kind: string;
  sortOrder: number;
}

const KIND_LABEL: Record<string, string> = {
  hero: "Cover Image",
  gallery: "Gallery",
  floorplan: "Floorplan",
  masterplan: "Master Plan",
  elevation: "Elevation",
};

/** "hero" (Cover Image) is uploaded via the dedicated CoverImageUploader above this component — excluded here so there's only one upload path for it. */
const SELECTABLE_KINDS = IMAGE_KINDS.filter((kind) => kind !== "hero");

const initialState: ImageActionState = {};

export default function ImageUploader({
  projectId,
  images,
}: {
  projectId: string;
  images: ProjectImageItem[];
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(addProjectImageAction, initialState);
  const [dragActive, setDragActive] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    setPendingFiles(Array.from(fileList));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (fileInputRef.current) {
      fileInputRef.current.files = event.dataTransfer.files;
    }
    handleFiles(event.dataTransfer.files);
  }

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Images</h3>
      <p className="mt-1 text-xs text-muted">
        Uploaded to Cloudinary and attached to this project. First hero image is used on listing cards. Drag &amp; drop or
        select multiple files at once.
      </p>

      <form ref={formRef} action={formAction} className="mt-4 flex flex-col gap-3 border-b border-border pb-4">
        <input type="hidden" name="projectId" value={projectId} />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border border-dashed px-4 py-6 text-center transition-colors ${
            dragActive ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            required
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
          <span className="text-xs text-foreground">
            {pendingFiles.length > 0 ? `${pendingFiles.length} file(s) selected` : "Drag & drop images here, or click to browse"}
          </span>
          <span className="text-[10px] text-muted">JPEG, PNG, WEBP or AVIF · up to 8MB each</span>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-muted">Kind</span>
            <select
              name="kind"
              defaultValue="gallery"
              className="rounded-sm border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground focus:border-accent focus:outline-none"
            >
              {SELECTABLE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-muted">Alt text</span>
            <input
              type="text"
              name="alt"
              placeholder="Optional description (applied to all files in this batch)"
              className="rounded-sm border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </label>
          <SubmitButton pendingText="Uploading...">Upload</SubmitButton>
        </div>
      </form>
      {state.error ? (
        <p className="mt-2 rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="mt-2 rounded-sm border border-positive/40 bg-positive/10 px-3 py-2 text-xs text-positive">
          {state.uploadedCount} image(s) uploaded.
        </p>
      ) : null}

      {images.filter((img) => img.kind !== "hero").length === 0 ? (
        <p className="mt-4 text-xs text-muted">No images uploaded yet.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {SELECTABLE_KINDS.filter((kind) => images.some((img) => img.kind === kind)).map((kind) => {
            const group = images.filter((img) => img.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder);
            return (
              <div key={kind}>
                <p className="font-mono text-[10px] uppercase tracking-wide text-accent">{KIND_LABEL[kind]}</p>
                <div className="mt-1.5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {group.map((image, index) => (
                    <div key={image.id} className="overflow-hidden rounded-sm border border-border bg-background">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.url} alt={image.alt ?? ""} className="h-24 w-full object-cover" loading="lazy" />
                      <div className="flex items-center justify-between gap-1 p-1.5">
                        <div className="flex gap-0.5">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => reorderProjectImageAction(image.id, "up").then(() => router.refresh())}
                            className="rounded-sm border border-border px-1 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent disabled:opacity-30"
                            aria-label="Move earlier"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={index === group.length - 1}
                            onClick={() => reorderProjectImageAction(image.id, "down").then(() => router.refresh())}
                            className="rounded-sm border border-border px-1 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent disabled:opacity-30"
                            aria-label="Move later"
                          >
                            ↓
                          </button>
                        </div>
                        <ConfirmButton action={() => deleteProjectImageAction(image.id)} label="Delete" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
