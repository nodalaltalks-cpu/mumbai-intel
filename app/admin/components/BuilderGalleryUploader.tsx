"use client";

import { useActionState, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { addBuilderImageAction, deleteBuilderImageAction, reorderBuilderImageAction, type BuilderImageActionState } from "@/lib/actions/builder-images";
import ConfirmButton from "./ConfirmButton";
import SubmitButton from "./SubmitButton";

export interface BuilderImageItem {
  id: string;
  url: string;
  alt: string | null;
  sortOrder: number;
}

const initialState: BuilderImageActionState = {};

export default function BuilderGalleryUploader({ builderId, images }: { builderId: string; images: BuilderImageItem[] }) {
  const router = useRouter();
  const action = addBuilderImageAction.bind(null, builderId);
  const [state, formAction] = useActionState(action, initialState);
  const [dragActive, setDragActive] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    setPendingCount(fileList.length);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (fileInputRef.current) fileInputRef.current.files = event.dataTransfer.files;
    handleFiles(event.dataTransfer.files);
  }

  const sorted = [...images].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Gallery</h3>
      <p className="mt-1 text-xs text-muted">Office, leadership, project showcase photos — separate from the logo and cover image.</p>

      <form action={formAction} className="mt-4 flex flex-col gap-3 border-b border-border pb-4">
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
            {pendingCount > 0 ? `${pendingCount} file(s) selected` : "Drag & drop images here, or click to browse"}
          </span>
          <span className="text-[10px] text-muted">JPEG, PNG, WEBP or AVIF · up to 8MB each</span>
        </div>
        <div>
          <SubmitButton pendingText="Uploading...">Upload</SubmitButton>
        </div>
      </form>
      {state.error ? <p className="mt-2 text-xs text-negative">{state.error}</p> : null}
      {state.success ? <p className="mt-2 text-xs text-positive">{state.uploadedCount} image(s) uploaded.</p> : null}

      {sorted.length === 0 ? (
        <p className="mt-4 text-xs text-muted">No gallery images uploaded yet.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {sorted.map((image, index) => (
            <div key={image.id} className="overflow-hidden rounded-sm border border-border bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt={image.alt ?? ""} className="h-24 w-full object-cover" loading="lazy" />
              <div className="flex items-center justify-between gap-1 p-1.5">
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => reorderBuilderImageAction(image.id, "up").then(() => router.refresh())}
                    className="rounded-sm border border-border px-1 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent disabled:opacity-30"
                    aria-label="Move earlier"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === sorted.length - 1}
                    onClick={() => reorderBuilderImageAction(image.id, "down").then(() => router.refresh())}
                    className="rounded-sm border border-border px-1 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent disabled:opacity-30"
                    aria-label="Move later"
                  >
                    ↓
                  </button>
                </div>
                <ConfirmButton action={() => deleteBuilderImageAction(image.id)} label="Delete" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
