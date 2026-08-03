"use client";

import { useActionState } from "react";
import { addProjectImageAction, deleteProjectImageAction, type ImageActionState } from "@/lib/actions/images";
import ConfirmButton from "./ConfirmButton";
import SubmitButton from "./SubmitButton";

export interface ImageManagerProject {
  id: string;
  name: string;
}

export interface ImageManagerItem {
  id: string;
  url: string;
  alt: string | null;
  kind: string;
  project: { id: string; name: string; slug: string };
}

const initialState: ImageActionState = {};

export default function AllImagesManager({
  projects,
  images,
}: {
  projects: ImageManagerProject[];
  images: ImageManagerItem[];
}) {
  const [state, formAction] = useActionState(addProjectImageAction, initialState);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-sm border border-border bg-surface p-4">
        <h2 className="font-mono text-sm font-semibold text-foreground">Upload image</h2>
        {projects.length === 0 ? (
          <p className="mt-2 text-xs text-muted">Create a project first — images must be attached to one.</p>
        ) : (
          <form action={formAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-muted">Project</span>
              <select
                name="projectId"
                required
                defaultValue=""
                className="rounded-sm border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground focus:border-accent focus:outline-none"
              >
                <option value="" disabled>
                  Select a project
                </option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-muted">File</span>
              <input
                type="file"
                name="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                required
                className="rounded-sm border border-border bg-surface px-3 py-2 text-xs text-foreground file:mr-3 file:rounded-sm file:border-0 file:bg-accent file:px-2.5 file:py-1 file:text-xs file:font-mono file:font-semibold file:uppercase file:text-white"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-muted">Kind</span>
              <select
                name="kind"
                defaultValue="gallery"
                className="rounded-sm border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground focus:border-accent focus:outline-none"
              >
                <option value="hero">Hero</option>
                <option value="gallery">Gallery</option>
                <option value="floorplan">Floorplan</option>
                <option value="masterplan">Masterplan</option>
                <option value="elevation">Elevation</option>
              </select>
            </label>
            <SubmitButton pendingText="Uploading...">Upload</SubmitButton>
          </form>
        )}
        {state.error ? (
          <p className="mt-2 rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">
            {state.error}
          </p>
        ) : null}
      </div>

      <div>
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">All images ({images.length})</h2>
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border py-14 text-center">
            <p className="font-mono text-xs uppercase tracking-wide text-muted">No images uploaded yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {images.map((image) => (
              <div key={image.id} className="overflow-hidden rounded-sm border border-border bg-background">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.alt ?? ""} className="h-28 w-full object-cover" loading="lazy" />
                <div className="p-2">
                  <p className="truncate font-mono text-[10px] text-foreground">{image.project.name}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wide text-muted">{image.kind}</span>
                    <ConfirmButton action={() => deleteProjectImageAction(image.id)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
