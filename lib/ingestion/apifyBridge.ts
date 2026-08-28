import "server-only";
import { prisma } from "@/lib/prisma";
import { runProjectFileImport } from "./fileImportRunner";
import type { ConnectorRunSummary } from "./types";

/**
 * Minimal shape this bridge reads from an Apify actor-run webhook payload —
 * Apify's real payload has many more fields; these are the only ones this
 * bridge needs. `resource` is the full Run object (same shape as
 * `GET /v2/actor-runs/{runId}`), which Apify includes in every run-event
 * webhook by default.
 */
export interface ApifyWebhookPayload {
  eventType?: string;
  resource?: {
    id?: string;
    actId?: string;
    status?: string;
    defaultDatasetId?: string;
  };
}

/**
 * Every distinct way processing this webhook can end, as a discriminated
 * union — lets the route map each outcome to the right HTTP status without
 * the bridge itself knowing anything about HTTP (kept pure/testable).
 */
export type ApifyBridgeOutcome =
  | { kind: "invalid_payload"; error: string }
  | { kind: "run_not_succeeded"; runId: string; actorId: string; status: string | undefined }
  | { kind: "duplicate"; runId: string; actorId: string; batchId: string }
  | { kind: "config_error"; error: string }
  | { kind: "dataset_fetch_failed"; runId: string; actorId: string; error: string }
  | { kind: "empty_dataset"; runId: string; actorId: string }
  | { kind: "import_failed"; runId: string; actorId: string; received: number; error: string }
  | { kind: "imported"; runId: string; actorId: string; batchId: string; received: number; summary: ConnectorRunSummary };

const APIFY_API_BASE = "https://api.apify.com/v2";

/** Idempotency key: unique per (actor, run) — see processApifyWebhook's dedup check. Also becomes each staged row's sourceRef prefix (via runProjectFileImport's own `${sourceKey}:row-N` fallback), so every Project traces back to the exact run + row that produced it. */
function buildSourceKey(actorId: string, runId: string): string {
  return `apify:${actorId}:${runId}`;
}

async function fetchDatasetItems(datasetId: string, token: string): Promise<unknown[]> {
  const url = `${APIFY_API_BASE}/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&clean=true`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`Network error calling Apify dataset API: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  if (!response.ok) {
    throw new Error(`Apify dataset API returned ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("Apify dataset API response was not a JSON array");
  }
  return data;
}

/**
 * Processes one Apify actor-run webhook end-to-end: validate the payload →
 * skip non-successful runs → dedupe by (actor, run) → fetch the run's
 * dataset → hand the items to the EXISTING runProjectFileImport() exactly as
 * if they were an uploaded JSON file. No new staging system, no direct
 * Project writes — every record still lands in IngestStagingRecord for
 * review at /admin/data-sync/review, same as a manual CSV/JSON upload.
 *
 * Idempotency: checked at the application level (query-then-create, no new
 * DB unique constraint) against IngestBatch.sourceKey, which this bridge sets
 * to a value unique per (actor, run) — the same check-then-act pattern
 * lib/ingestion/runner.ts's single-flight guard already uses elsewhere in
 * this codebase, not a new convention. A genuinely simultaneous duplicate
 * delivery (vs. Apify's own spaced-out retries) could in theory still race
 * past this check, same as that existing guard; closing that would need a DB
 * unique constraint on a column that's intentionally non-unique for every
 * other ingestion source, which is a schema change out of scope for this
 * bridge.
 */
export async function processApifyWebhook(payload: ApifyWebhookPayload): Promise<ApifyBridgeOutcome> {
  const runId = payload?.resource?.id;
  const actorId = payload?.resource?.actId;
  const status = payload?.resource?.status;
  const datasetId = payload?.resource?.defaultDatasetId;

  if (!runId || !actorId) {
    return { kind: "invalid_payload", error: "Webhook payload is missing resource.id and/or resource.actId" };
  }

  if (status !== "SUCCEEDED") {
    console.info(`[apify-bridge] actor=${actorId} run=${runId} status="${status ?? "unknown"}" (not SUCCEEDED) — skipping, nothing imported`);
    return { kind: "run_not_succeeded", runId, actorId, status };
  }

  if (!datasetId) {
    return { kind: "invalid_payload", error: "Webhook payload is missing resource.defaultDatasetId" };
  }

  const sourceKey = buildSourceKey(actorId, runId);

  const existingBatch = await prisma.ingestBatch.findFirst({ where: { sourceKey }, select: { id: true } });
  if (existingBatch) {
    console.info(`[apify-bridge] actor=${actorId} run=${runId} already processed as batch ${existingBatch.id} — skipping duplicate webhook delivery`);
    return { kind: "duplicate", runId, actorId, batchId: existingBatch.id };
  }

  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    return { kind: "config_error", error: "APIFY_API_TOKEN is not configured" };
  }

  let items: unknown[];
  try {
    items = await fetchDatasetItems(datasetId, token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error fetching Apify dataset";
    console.error(`[apify-bridge] actor=${actorId} run=${runId} dataset=${datasetId} fetch failed:`, message);
    return { kind: "dataset_fetch_failed", runId, actorId, error: message };
  }

  console.info(`[apify-bridge] actor=${actorId} run=${runId} dataset=${datasetId}: received ${items.length} record(s)`);

  // A legitimately empty dataset (the scrape found nothing new) is a quiet
  // no-op, not a failure -- checked here rather than letting
  // runProjectFileImport's own "File contained no data rows" throw handle it,
  // so an empty scheduled run never shows up as a "failed" batch the way an
  // admin accidentally uploading an empty CSV correctly still does (that
  // existing throw is untouched, still fires for the human-upload path).
  if (items.length === 0) {
    console.info(`[apify-bridge] actor=${actorId} run=${runId} dataset=${datasetId}: 0 records — nothing to import`);
    return { kind: "empty_dataset", runId, actorId };
  }

  try {
    const summary = await runProjectFileImport({
      sourceKey,
      fileText: JSON.stringify(items),
      fileFormat: "json",
      dataSource: "EXTERNAL_OPEN_DATA",
      trigger: "scheduled",
    });

    const batch = await prisma.ingestBatch.findFirst({ where: { sourceKey }, select: { id: true } });

    console.info(
      `[apify-bridge] actor=${actorId} run=${runId} batch=${batch?.id ?? "unknown"}: ` +
        `received=${items.length} staged=${summary.staged} failed=${summary.failed} skipped=${summary.skipped} written=${summary.written}`
    );

    return { kind: "imported", runId, actorId, batchId: batch?.id ?? sourceKey, received: items.length, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error running the Project importer";
    console.error(`[apify-bridge] actor=${actorId} run=${runId} runProjectFileImport failed:`, message);
    return { kind: "import_failed", runId, actorId, received: items.length, error: message };
  }
}
