"use client";

import { useActionState, useState } from "react";
import { addProjectImageAction, deleteProjectImageAction, type ImageActionState } from "@/lib/actions/images";
import type { ProjectImageItem } from "./ImageUploader";
import ConfirmButton from "./ConfirmButton";
import SubmitButton from "./SubmitButton";

const initialState: ImageActionState = {};
const COVER_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const COVER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * The Project's Cover Image — separate from the general Images/Gallery
 * uploader below it, even though both call the exact same
 * addProjectImageAction/deleteProjectImageAction (kind="hero" here, no new
 * backend logic). This is the image shown on every Project Card, search
 * result, and everywhere the project is listed.
 */
export default function CoverImageUploader({ projectId, images }: { projectId: string; images: ProjectImageItem[] }) {
  const [state, formAction] = useActionState(addProjectImageAction, initialState);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const coverImages = images.filter((img) => img.kind === "hero");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const file = new FormData(event.currentTarget).get("file");
    if (file instanceof File && file.size > COVER_IMAGE_MAX_BYTES) {
      event.preventDefault();
      setSizeError("Image is too large. Maximum size is 5MB.");
      return;
    }
    setSizeError(null);
  }

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">
        Cover Image <span className="text-negative">*</span>
      </h3>
      <p className="mt-1 text-xs text-muted">
        The primary image shown on Project Cards, search results, Compare, Wishlist, Recently Viewed and everywhere
        this project is listed.
      </p>

      {coverImages.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-3">
          {coverImages.map((image) => (
            <div key={image.id} className="overflow-hidden rounded-sm border border-border bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt={image.alt ?? ""} className="h-32 w-48 object-cover" />
              <div className="flex items-center justify-between gap-2 p-1.5">
                <a href={image.url} target="_blank" rel="noreferrer" className="text-[10px] text-accent hover:underline">
                  Preview
                </a>
                <ConfirmButton action={() => deleteProjectImageAction(image.id)} label="Remove Image" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">No cover image set yet.</p>
      )}

      <form action={formAction} onSubmit={handleSubmit} className="mt-3 flex items-end gap-3">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="kind" value="hero" />
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted">{coverImages.length > 0 ? "Replace Image" : "Upload Cover Image"}</span>
          <input
            type="file"
            name="file"
            accept={COVER_IMAGE_ACCEPT}
            required
            className="rounded-sm border border-border bg-surface px-3 py-2 text-xs text-foreground file:mr-3 file:rounded-sm file:border-0 file:bg-accent file:px-2.5 file:py-1 file:text-xs file:font-mono file:font-semibold file:uppercase file:text-white"
          />
          <span className="text-[10px] text-muted">Allowed: JPG, PNG, WEBP · Recommended: 1600×900 · Max size: 5MB</span>
        </label>
        <SubmitButton pendingText="Uploading...">{coverImages.length > 0 ? "Replace Image" : "Upload Cover Image"}</SubmitButton>
      </form>
      {sizeError ? <p className="mt-2 rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">{sizeError}</p> : null}
      {state.error ? <p className="mt-2 rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">{state.error}</p> : null}
      {state.success ? (
        <p className="mt-2 rounded-sm border border-positive/40 bg-positive/10 px-3 py-2 text-xs text-positive">Cover image updated.</p>
      ) : null}
    </div>
  );
}
