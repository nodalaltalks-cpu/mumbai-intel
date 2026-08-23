"use client";

import { useState, useTransition } from "react";
import { toggleSavedSearchNotifyAction } from "@/lib/actions/saved-searches";

/** Wires the existing (previously unused) toggleSavedSearchNotifyAction into the Saved Searches list — lets a user turn on/off match alerts for one saved search without leaving the page. */
export default function SavedSearchAlertToggle({ id, notifyOnMatch }: { id: string; notifyOnMatch: boolean }) {
  const [on, setOn] = useState(notifyOnMatch);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      await toggleSavedSearchNotifyAction(id, next);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-pressed={on}
      className={`flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide transition-colors disabled:opacity-60 ${
        on ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-muted hover:border-accent hover:text-accent"
      }`}
    >
      {on ? "Alerts On" : "Alerts Off"}
    </button>
  );
}
