"use client";

import { useEffect } from "react";

// Part 2/23 of the Platform Capacity spec: a background tab must not count
// as meaningful activity indefinitely, and polling must stay lightweight.
// 20s while the tab is actually visible, paused entirely (no interval at
// all, not just a skipped fetch) the moment it's hidden — a closed/backgrounded
// tab simply stops sending anything, and the server-side PresenceHeartbeat
// row goes stale and drops out of the active-user windows within minutes
// (see lib/platform-metrics/presence.ts) without this component doing
// anything else.
const HEARTBEAT_INTERVAL_MS = 20_000;

function sendHeartbeat() {
  fetch("/api/presence/heartbeat", { method: "POST", keepalive: true }).catch(() => {
    // Best-effort — presence telemetry must never surface an error to the visitor.
  });
}

/** Mounted once in the public root layout (not in /admin — founder/admin activity isn't counted as platform traffic). */
export default function PresenceHeartbeat() {
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (interval !== null) return;
      sendHeartbeat();
      interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    }
    function stop() {
      if (interval === null) return;
      clearInterval(interval);
      interval = null;
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") start();
      else stop();
    }

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stop();
    };
  }, []);

  return null;
}
