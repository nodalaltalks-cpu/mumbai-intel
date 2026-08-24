"use client";

import { useActionState, useState } from "react";
import { clearApplicationCacheAction, type CacheClearState } from "@/lib/actions/cache-admin";
import SubmitButton from "./SubmitButton";

const initialState: CacheClearState = {};

/** Founder-only fallback cache refresh — Settings page, ADMIN role gated server-side (clearApplicationCacheAction itself, not just this button being hidden). */
export default function CacheManagementCard() {
  const [state, formAction] = useActionState(clearApplicationCacheAction, initialState);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h2 className="font-mono text-sm font-semibold text-foreground">Cache Management</h2>
      <p className="mt-1 text-xs text-muted">
        Current status: <span className="text-foreground">active</span> — pages refresh automatically after every
        admin update. Use this only if something looks stale.
      </p>

      {state.success ? (
        <div className="mt-3 rounded-sm border border-positive/40 bg-positive/10 px-3 py-2 text-xs text-positive">
          Cache refreshed successfully.
        </div>
      ) : null}
      {state.error ? (
        <div className="mt-3 rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">{state.error}</div>
      ) : null}

      {confirming ? (
        <div className="mt-3 rounded-sm border border-border bg-background p-3">
          <p className="text-xs font-semibold text-foreground">Clear application cache?</p>
          <p className="mt-1 text-[11px] text-muted">
            This will refresh cached platform data. It will not delete projects, transactions, users or analytics.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <form action={formAction} onSubmit={() => setConfirming(false)}>
              <SubmitButton pendingText="Refreshing...">Confirm</SubmitButton>
            </form>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
        >
          Clear / Refresh Cache
        </button>
      )}
    </div>
  );
}
