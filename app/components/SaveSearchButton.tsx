"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveSearchAction } from "@/lib/actions/saved-searches";
import { usePremiumGate } from "@/lib/premium/gate-context";

const RESUME_PARAM = "resumeSaveSearch";

/** Saves the /projects page's current filter state (its own query string, unchanged) as a named SavedSearch for the signed-in user. */
export default function SaveSearchButton() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const resumedRef = useRef(false);
  const { openGate } = usePremiumGate();

  // A saved search needs a user-chosen label, so post-login "resume" reopens
  // the label input pre-filled with what they'd typed — it doesn't silently
  // auto-save the way Wishlist does, since the label is meaningful content.
  useEffect(() => {
    if (resumedRef.current) return;
    const resumeLabel = searchParams.get(RESUME_PARAM);
    if (resumeLabel === null) return;
    resumedRef.current = true;

    const next = new URLSearchParams(searchParams);
    next.delete(RESUME_PARAM);
    const nextQs = next.toString();
    router.replace(nextQs ? `${pathname}?${nextQs}` : pathname, { scroll: false });

    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring UI state from a one-time URL param on mount, not derivable from render
    setLabel(resumeLabel);
    setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSave() {
    if (!label.trim()) return;
    const filters = Object.fromEntries(searchParams.entries());
    startTransition(async () => {
      const result = await saveSearchAction(label, filters, false);
      if (result.error) {
        openGate("save-search", buildNext());
        return;
      }
      setMessage("Search saved to your dashboard.");
      setLabel("");
      setOpen(false);
    });
  }

  function buildNext(): string {
    const next = new URLSearchParams(searchParams);
    next.set(RESUME_PARAM, label);
    return `${pathname}?${next.toString()}`;
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
      {message ? <span className="text-[11px] text-positive">{message}</span> : null}
    </div>
  );
}
