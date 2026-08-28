"use client";

import { useState } from "react";
import { useProfileCompletion } from "@/lib/profile-completion-client";

/**
 * A bold, always-reachable confirmation pinned to the bottom of the
 * viewport — the same persistent-bottom-bar pattern as familiar mobile apps,
 * so it's never more than a thumb's reach away no matter which accordion
 * section is open. For every field that already autosaves on its own, this
 * is just a clear, on-demand "saved" confirmation and adds no second save
 * path. Phone is the one deliberate exception (a mistyped number shouldn't
 * get silently auto-saved) — it registers a real save function via
 * runManualSaves(), so THIS tap is the only thing that actually persists it.
 * Safe to tap any number of times either way, never a duplicate/competing
 * save request.
 */
export default function SavePreferenceButton() {
  const [justConfirmed, setJustConfirmed] = useState(false);
  const { runManualSaves } = useProfileCompletion();

  function handleClick() {
    runManualSaves();
    setJustConfirmed(true);
    window.setTimeout(() => setJustConfirmed(false), 2200);
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 pt-3 backdrop-blur-sm"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto w-full max-w-4xl">
        <button
          type="button"
          onClick={handleClick}
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3.5 text-sm font-mono font-bold uppercase tracking-wide shadow-lg transition-colors ${
            justConfirmed ? "bg-positive text-white" : "bg-accent text-white active:bg-accent-dim"
          }`}
        >
          {justConfirmed ? (
            <>
              <span aria-hidden="true">✓</span> Preferences Saved
            </>
          ) : (
            "Save Preference"
          )}
        </button>
      </div>
    </div>
  );
}
