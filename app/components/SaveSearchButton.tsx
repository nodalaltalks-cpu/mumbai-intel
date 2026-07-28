"use client";

import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { saveSearchAction } from "@/lib/actions/saved-searches";

/** Saves the /projects page's current filter state (its own query string, unchanged) as a named SavedSearch for the signed-in user. */
export default function SaveSearchButton() {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!label.trim()) return;
    const filters = Object.fromEntries(searchParams.entries());
    startTransition(async () => {
      const result = await saveSearchAction(label, filters, false);
      if (result.error) {
        setMessage({ text: result.error, isError: true });
        return;
      }
      setMessage({ text: "Search saved to your dashboard.", isError: false });
      setLabel("");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setMessage(null);
        }}
        className="rounded-full border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted transition-colors hover:border-accent hover:text-accent"
      >
        Save Search
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="e.g. 2 BHK Andheri"
        className="w-40 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending || !label.trim()}
        className="rounded-full bg-accent px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide text-white disabled:opacity-60"
      >
        {isPending ? "…" : "Save"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-muted hover:text-foreground">
        Cancel
      </button>
      {message ? <span className={`text-[11px] ${message.isError ? "text-negative" : "text-positive"}`}>{message.text}</span> : null}
    </div>
  );
}
