"use client";

import { useEffect } from "react";

export default function AdminDashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[admin] segment error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-negative/40 py-16 text-center">
      <p className="font-mono text-sm font-semibold uppercase tracking-wide text-negative">Something went wrong</p>
      <p className="max-w-sm text-xs text-muted">
        This section failed to load, likely a temporary database or network issue. The rest of the admin panel is
        unaffected — try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-sm border border-border px-4 py-2 text-xs font-mono uppercase tracking-wide text-foreground hover:border-accent hover:text-accent"
      >
        Retry
      </button>
    </div>
  );
}
