/**
 * Google Analytics 4 event helpers — thin wrappers around the `gtag` global
 * that `<GoogleAnalytics>` (app/layout.tsx, @next/third-parties/google)
 * installs. Deliberately separate from lib/analytics/research-events.ts's
 * ResearchEvent system: that's this app's own first-party, no-PII intent
 * analytics stored in Postgres; this file only ever talks to Google's
 * script, never the database, and every call is a no-op if GA isn't
 * configured (NEXT_PUBLIC_GA_MEASUREMENT_ID unset) or hasn't loaded yet —
 * a missing/slow analytics script must never break a real user action.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/** Set by app/api/auth/google/callback/route.ts on a successful login, read once by GoogleLoginPing (app/components/analytics/GoogleLoginPing.tsx) and cleared immediately after firing. */
export const GA_GOOGLE_LOGIN_COOKIE = "ga_google_login_success";

/** The one place a `window.gtag('event', ...)` call is ever made. */
export function trackGAEvent(name: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", name, params);
  } catch {
    // Best-effort — analytics must never throw into a real user action.
  }
}

export function trackSearchPerformed(query: string, resultCount?: number): void {
  trackGAEvent("search_performed", { search_term: query, ...(resultCount !== undefined ? { result_count: resultCount } : {}) });
}

export function trackProjectViewed(projectId: string, projectName: string): void {
  trackGAEvent("project_viewed", { project_id: projectId, project_name: projectName });
}

export function trackBuilderViewed(builderId: string, builderName: string): void {
  trackGAEvent("builder_viewed", { builder_id: builderId, builder_name: builderName });
}

export function trackLocalityViewed(localityId: string, localityName: string): void {
  trackGAEvent("locality_viewed", { locality_id: localityId, locality_name: localityName });
}

export function trackTransactionViewed(transactionId: string): void {
  trackGAEvent("transaction_viewed", { transaction_id: transactionId });
}

export function trackReportViewed(reportType: string, entityName?: string): void {
  trackGAEvent("report_viewed", { report_type: reportType, ...(entityName ? { entity_name: entityName } : {}) });
}

export function trackMarketDataViewed(): void {
  trackGAEvent("market_data_viewed");
}

export function trackCompareClicked(projectSlug: string, compareCount?: number): void {
  trackGAEvent("compare_clicked", { project_slug: projectSlug, ...(compareCount !== undefined ? { compare_count: compareCount } : {}) });
}

export function trackBrochureClicked(projectSlug: string): void {
  trackGAEvent("brochure_clicked", { project_slug: projectSlug });
}

export function trackGuestPaywallTriggered(feature: string): void {
  trackGAEvent("guest_paywall_triggered", { feature });
}

export function trackSignInStarted(method: "google" | "email"): void {
  trackGAEvent("sign_in_started", { method });
}

export function trackGoogleLoginSuccess(): void {
  trackGAEvent("google_login_success");
}

export function trackSavedProject(projectId: string): void {
  trackGAEvent("saved_project", { project_id: projectId });
}

export function trackFilterApplied(context: string, filters?: Record<string, unknown>): void {
  trackGAEvent("filter_applied", { context, ...(filters ? { filters: JSON.stringify(filters) } : {}) });
}
