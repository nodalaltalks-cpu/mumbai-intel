"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Part 4 — auto-refresh (bounded, not aggressive polling — one request/60s
 * per open admin tab) combined with a "Last updated: XXs ago" ticker and a
 * manual Refresh button, in one component so the ticker actually resets
 * when a refresh happens (auto or manual) — `router.refresh()` re-renders
 * the Server Component tree but does NOT remount this client component, so
 * the two concerns have to share state to stay honest.
 */
const AUTO_REFRESH_INTERVAL_MS = 60_000;

export default function LastUpdated() {
  const router = useRouter();
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const tick = setInterval(() => setSecondsAgo((s) => s + 1), 1000);
    const autoRefresh = setInterval(() => {
      router.refresh();
      setSecondsAgo(0);
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(autoRefresh);
    };
  }, [router]);

  function refreshNow() {
    setRefreshing(true);
    router.refresh();
    setSecondsAgo(0);
    setTimeout(() => setRefreshing(false), 500);
  }

  return (
    <div className="flex items-center gap-2 text-[11px] text-muted">
      <span>Last updated: {secondsAgo}s ago</span>
      <button
        type="button"
        onClick={refreshNow}
        disabled={refreshing}
        className="rounded-sm border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {refreshing ? "…" : "Refresh"}
      </button>
    </div>
  );
}
