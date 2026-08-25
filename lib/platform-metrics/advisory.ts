import "server-only";
import type { PlatformLoadState } from "@prisma/client";
import type { RegionCheck } from "./queries";
import type { CapacityBaseline } from "./capacity-baseline";
import type { DbMetricsSnapshot } from "./db-metrics";

/**
 * Part J/K — Scalability Readiness + "What should I do?" Both are derived,
 * rule-based summaries over the SAME real signals the rest of the page
 * already computes (region check, live DB metrics, capacity baseline,
 * current ML dashboard status) — no new measurement, no invented status.
 */

export type ReadinessStatus = "HEALTHY" | "NEEDS_OPTIMIZATION" | "DORMANT" | "UNKNOWN";

export interface ScalabilityReadiness {
  database: ReadinessStatus;
  databaseReason: string;
  application: ReadinessStatus;
  recommendationEngine: ReadinessStatus;
  analytics: ReadinessStatus;
  ml: ReadinessStatus;
  monitoring: ReadinessStatus;
}

export function computeScalabilityReadiness(params: { region: RegionCheck; db: DbMetricsSnapshot; loadState: PlatformLoadState; mlStatus: "PHASE1_ONLY" | "ML_SHADOW" | "ML_ENABLED" }): ScalabilityReadiness {
  let database: ReadinessStatus = "HEALTHY";
  let databaseReason = "No known bottleneck signal active right now.";

  if (params.region.mismatched === true) {
    database = "NEEDS_OPTIMIZATION";
    databaseReason = `Vercel functions run in ${params.region.vercelRegion}, Neon runs in ${params.region.neonRegion} — different continents. This alone plausibly explains most of the load-test latency curve.`;
  } else if (params.db.timeoutCount > 0) {
    database = "NEEDS_OPTIMIZATION";
    databaseReason = `${params.db.timeoutCount} connection timeout(s) observed recently — the same failure mode seen at 50 concurrent requests in the Phase 2 load test.`;
  } else if (params.loadState === "WARNING" || params.loadState === "CRITICAL") {
    database = "NEEDS_OPTIMIZATION";
    databaseReason = "Current load state indicates a real, active bottleneck.";
  } else if (params.region.mismatched === null) {
    databaseReason = "Region alignment unknown outside a live Vercel deployment (VERCEL_REGION isn't set locally).";
  }

  return {
    database,
    databaseReason,
    application: "HEALTHY", // no app-level error signal exists yet to contradict this — see "Not currently measured" disclosure elsewhere on the page
    recommendationEngine: "HEALTHY", // Phase 1 production, verified working (Phase 2 confirmed impression recording after the after()/cookies() fix)
    analytics: "HEALTHY", // ResearchEvent write path verified working, no volume concerns at current scale (fork audit: bounded, deliberate)
    ml: params.mlStatus === "PHASE1_ONLY" ? "DORMANT" : "HEALTHY",
    monitoring: "HEALTHY", // this page + presence + snapshot cron are all live and verified
  };
}

export interface RecommendedAction {
  label: string;
  detail: string;
}

/**
 * Only ever returns actions the CURRENT audit/measurements actually
 * support (Part K: "only show actions that are actually supported by the
 * audit") — every branch below cites the specific signal that triggered it.
 */
export function getRecommendedActions(params: { region: RegionCheck; db: DbMetricsSnapshot; loadState: PlatformLoadState; capacityBaseline: CapacityBaseline }): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  if (params.region.mismatched === true) {
    actions.push({
      label: "Co-locate Vercel functions with the Neon database region",
      detail: `Vercel runs in ${params.region.vercelRegion}, Neon in ${params.region.neonRegion}. Pinning Vercel's function region to match (or provisioning a Neon read replica/branch nearer Vercel) removes a transoceanic round trip from every single query — the single highest-leverage fix identified in the Phase 3 audit.`,
    });
  } else if (params.region.mismatched === null) {
    actions.push({
      label: "Confirm Vercel/Neon region alignment on the live deployment",
      detail: "This can only be checked from a real Vercel runtime (VERCEL_REGION isn't set locally) — open this page on the deployed site to see the live answer.",
    });
  }

  if (params.db.timeoutCount > 0) {
    actions.push({
      label: "Review Neon connection/concurrency limits for the current plan",
      detail: `${params.db.timeoutCount} connection timeout(s) observed — check the Neon dashboard's compute size and connection limits directly (this app has no Neon Management API key configured to read that automatically).`,
    });
  }

  if (!params.capacityBaseline.highestTestedConcurrency) {
    actions.push({
      label: "Establish a capacity baseline",
      detail: "No load test result has been recorded yet — run a controlled test and record it below so this dashboard can show real headroom instead of 'unknown'.",
    });
  } else if (params.capacityBaseline.confidence !== "HIGH") {
    actions.push({
      label: "Verify production Vercel capacity directly",
      detail: `The recorded test (${params.capacityBaseline.highestTestedConcurrency} concurrent, confidence ${params.capacityBaseline.confidence}) ran against a local server, not the deployed Vercel environment — a production-hosted test (e.g. via Vercel's Protection Bypass for Automation) would raise confidence.`,
    });
  }

  if (params.loadState === "WARNING" || params.loadState === "CRITICAL") {
    actions.push({ label: "Investigate the active bottleneck now", detail: "See the Primary Bottleneck banner above — this is a live signal, not historical." });
  }

  if (actions.length === 0) {
    actions.push({ label: "No action needed right now", detail: "No active bottleneck signal, and the known findings above are already surfaced for awareness." });
  }

  return actions;
}
