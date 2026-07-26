"use client";

import { useState, useTransition } from "react";
import { toggleSavedProjectAction } from "@/lib/actions/saved-projects";

export default function SaveProjectButton({ projectId, initialSaved }: { projectId: string; initialSaved: boolean }) {
  const [saved, setSaved] = useState(initialSaved);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await toggleSavedProjectAction(projectId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(result.saved);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-pressed={saved}
        className={`rounded-sm border px-2 py-1 text-[10px] font-mono uppercase tracking-wide transition-colors disabled:opacity-60 ${
          saved ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-muted hover:border-accent hover:text-accent"
        }`}
      >
        {saved ? "Saved" : "Save"}
      </button>
      {error ? <span className="text-[10px] text-negative">{error}</span> : null}
    </div>
  );
}
