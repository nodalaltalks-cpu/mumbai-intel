"use client";

import { useState, useTransition } from "react";
import { deactivateAccountAction } from "@/lib/actions/public-auth";

/**
 * Deliberately small and text-styled, not a card or a prominent button --
 * this is a discreet, secondary action a user who wants it can find, not
 * something every visitor's eye lands on. One inline confirmation step
 * (no modal), matching "don't add unnecessary friction beyond what's useful."
 */
export default function DeactivateAccountControl() {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-xs text-muted underline underline-offset-2 hover:text-negative">
        Deactivate account
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-negative/30 bg-negative/5 p-3">
      <p className="text-xs text-foreground">
        Deactivating hides your account and data from other users. It is not permanent -- signing back in reactivates it.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="rounded-sm border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-raised disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => startTransition(() => void deactivateAccountAction())}
          disabled={isPending}
          className="rounded-sm border border-negative/40 bg-negative/10 px-3 py-1.5 text-xs font-medium text-negative hover:bg-negative/20 disabled:opacity-60"
        >
          {isPending ? "Deactivating…" : "Yes, deactivate my account"}
        </button>
      </div>
    </div>
  );
}
