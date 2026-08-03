/**
 * Client-side research-intent tracking for the one event with no existing
 * server round-trip: a plain navigation click (e.g. "Continue Research").
 * Mirrors lib/track-brochure.ts's sendBeacon-with-fetch-fallback shape so
 * the write survives the click's navigation instead of racing it.
 */
export type ClientResearchEventType = "CONTINUE_RESEARCH_CLICKED" | "LOCKED_FEATURE_CLICKED";

export function trackResearchEvent(
  eventType: ClientResearchEventType,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;

  try {
    const payload = JSON.stringify({ eventType, entityType, entityId, metadata });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/research", new Blob([payload], { type: "application/json" }));
    } else {
      fetch("/api/analytics/research", { method: "POST", body: payload, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    }
  } catch {
    // Best-effort — never block the actual navigation over an analytics failure.
  }
}
