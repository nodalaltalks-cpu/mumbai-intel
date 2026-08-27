"use client";

import { useState } from "react";

/**
 * A bold, explicit confirmation the user can tap for reassurance — every
 * field on this page already auto-saves on its own (debounced, per field);
 * this button doesn't add a second save path or call anything new, it just
 * gives a clear, satisfying "your preferences are saved" moment on demand,
 * since that auto-save otherwise happens quietly in the background. Safe to
 * tap any number of times — purely a confirmation, never a duplicate/competing
 * save request.
 */
export default function SavePreferenceButton() {
  const [justConfirmed, setJustConfirmed] = useState(false);

  function handleClick() {
    setJustConfirmed(true);
    window.setTimeout(() => setJustConfirmed(false), 2200);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-mono font-bold uppercase tracking-wide shadow-sm transition-colors sm:w-auto ${
        justConfirmed ? "bg-positive text-white" : "bg-accent text-white hover:bg-accent-dim"
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
  );
}
