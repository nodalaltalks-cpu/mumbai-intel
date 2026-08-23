"use client";

import { useState, useTransition } from "react";
import { uploadImageAction } from "@/lib/actions/upload";

export default function SingleImageUploadField({
  name,
  label,
  defaultValue,
  isCoverImage = false,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  /** Skips upload-time compression (Cloudinary's quality:auto:good) -- for a field that's genuinely a cover/hero image, which must keep its original quality. Everything else compresses by default. */
  isCoverImage?: boolean;
}) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Remounts the underlying <input type="file"> after Remove so the browser's own "no file
  // chosen" state resets too -- a file input's value can't be cleared programmatically otherwise.
  const [inputKey, setInputKey] = useState(0);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("isCoverImage", String(isCoverImage));
    startTransition(async () => {
      const result = await uploadImageAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.url) setUrl(result.url);
    });
  }

  function handleRemove() {
    setUrl("");
    setError(null);
    setInputKey((k) => k + 1);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <input type="hidden" name={name} value={url} />
      <div className="flex items-center gap-3">
        {url ? (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-12 w-12 rounded-sm border border-border object-cover" />
            <button
              type="button"
              onClick={handleRemove}
              className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted transition-colors hover:border-negative hover:text-negative"
            >
              Remove
            </button>
          </div>
        ) : null}
        <input
          key={inputKey}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={handleFileChange}
          disabled={isPending}
          className="text-xs text-muted file:mr-3 file:rounded-sm file:border-0 file:bg-accent file:px-2.5 file:py-1 file:text-xs file:font-mono file:font-semibold file:uppercase file:text-white"
        />
      </div>
      {isPending ? <span className="text-[10px] text-muted">Uploading...</span> : null}
      {error ? <span className="text-[10px] text-negative">{error}</span> : null}
    </div>
  );
}
