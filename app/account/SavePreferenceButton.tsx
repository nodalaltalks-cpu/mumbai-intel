"use client";

import { useState } from "react";

/**
 * A bold, always-reachable confirmation pinned to the bottom of the
 * viewport — the same persistent-bottom-bar pattern as familiar mobile apps,
 * so it's never more than a thumb's reach away no matter which accordion
 * section is open. It doesn't add a second save path — every field on this
 * page already autosaves on its own; this just gives the user a clear,
 * on-demand "saved" confirmation. Safe to tap any number of times, never a
 * duplicate/competing save request.
 */
export default function SavePreferenceButton() {
  const [justConfirmed, setJustConfirmed] = useState(false);

  function handleClick() {
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
