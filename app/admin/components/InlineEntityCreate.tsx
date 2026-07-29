"use client";

import { useState, useTransition } from "react";

/**
 * "If it exists, select it. If not, create it inline." — a small expanding
 * row (not a modal; admin has no shared modal primitive and a plain field
 * matches "inline" more literally) used next to the Builder/Locality
 * selects in ProjectForm so an EDITOR never has to leave the Project form
 * to create a missing Builder or Locality.
 */
export default function InlineEntityCreate({
  label,
  action,
  onCreated,
}: {
  label: string;
  action: (name: string) => Promise<{ id?: string; name?: string; error?: string }>;
  onCreated: (item: { id: string; name: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-[11px] font-mono uppercase tracking-wide text-accent hover:underline"
      >
        + New {label}
      </button>
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await action(name);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.id && result.name) onCreated({ id: result.id, name: result.name });
      setOpen(false);
      setName("");
    });
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={`${label} name`}
          className="flex-1 rounded-sm border border-border bg-surface px-2 py-1 text-xs text-foreground focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          disabled={isPending || !name.trim()}
          onClick={submit}
          className="rounded-sm border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-accent hover:bg-accent/20 disabled:opacity-60"
        >
          {isPending ? "…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-negative hover:text-negative"
        >
          Cancel
        </button>
      </div>
      {error ? <span className="text-[10px] text-negative">{error}</span> : null}
    </div>
  );
}
