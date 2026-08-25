"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Part 23 — "real-time" refresh without a websocket/SSE layer this app
 * doesn't have: re-runs the Server Component render (a fresh Prisma read)
 * every 60s. Bounded, predictable — one request/minute per open admin tab,
 * not the "excessive polling" the spec explicitly warns against.
 */
const REFRESH_INTERVAL_MS = 60_000;

export default function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);
  return null;
}
