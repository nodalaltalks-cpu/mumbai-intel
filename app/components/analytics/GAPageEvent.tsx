"use client";

import { useEffect, useRef } from "react";
import { trackGAEvent } from "@/lib/analytics/ga";

/**
 * Fires one GA4 event on mount — the bridge between a server-rendered page
 * (which already knows the entity it's showing) and `gtag`, which only ever
 * runs in the browser. Mount this once near the top of a detail/listing
 * page's JSX with the event name + params for that page; it renders nothing.
 * `params` is read only on first mount (a slug/id page doesn't need this to
 * re-fire on prop identity changes within the same navigation).
 */
export default function GAPageEvent({ event, params }: { event: string; params?: Record<string, unknown> }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackGAEvent(event, params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  return null;
}
