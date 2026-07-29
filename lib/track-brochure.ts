/**
 * Client-side brochure funnel tracking — fires a beacon to
 * /api/analytics/brochure and never blocks or delays the actual download.
 * Uses sendBeacon (survives the page navigating away, which a plain fetch
 * can drop mid-flight) with a keepalive-fetch fallback for browsers/contexts
 * where sendBeacon is unavailable.
 */
export type BrochureEventType = "VIEWED" | "DOWNLOAD_STARTED" | "DOWNLOAD_COMPLETED" | "DOWNLOAD_FAILED";

export function trackBrochureEvent(slug: string, eventType: BrochureEventType): void {
  if (typeof window === "undefined") return;

  try {
    const params = new URLSearchParams(window.location.search);
    const payload = JSON.stringify({
      slug,
      eventType,
      referrer: document.referrer || null,
      landingPage: window.location.pathname,
      utmSource: params.get("utm_source"),
      utmMedium: params.get("utm_medium"),
      utmCampaign: params.get("utm_campaign"),
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/brochure", new Blob([payload], { type: "application/json" }));
    } else {
      fetch("/api/analytics/brochure", { method: "POST", body: payload, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    }
  } catch {
    // Best-effort — never block the actual download over an analytics failure.
  }
}
