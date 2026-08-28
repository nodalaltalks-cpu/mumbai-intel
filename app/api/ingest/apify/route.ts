import { NextResponse, type NextRequest } from "next/server";
import { verifyApifyWebhookSecret } from "@/lib/verify-apify-webhook-secret";
import { processApifyWebhook, type ApifyWebhookPayload, type ApifyBridgeOutcome } from "@/lib/ingestion/apifyBridge";

// Same reasoning as app/api/cron/ingest/route.ts: fetching a large dataset
// from Apify and running it through the importer can take a while.
export const maxDuration = 300;

/** Every outcome the bridge can produce, mapped to the HTTP status Apify's webhook delivery sees. 200 for anything that was handled correctly even if nothing was imported (duplicate, empty, run not succeeded) -- Apify should not retry those. 4xx/5xx only for things that are genuinely wrong. */
const STATUS_BY_OUTCOME: Record<ApifyBridgeOutcome["kind"], number> = {
  invalid_payload: 400,
  run_not_succeeded: 200,
  duplicate: 200,
  config_error: 500,
  dataset_fetch_failed: 502,
  empty_dataset: 200,
  import_failed: 500,
  imported: 200,
};

/**
 * Apify actor-run webhook receiver. Configure this URL as a webhook on the
 * Apify Actor/Task for the "Run succeeded" event (and ideally also "Run
 * failed"/"Run aborted" so those are visible in this route's own logs, since
 * processApifyWebhook already no-ops safely on any non-SUCCEEDED status).
 *
 * This route itself only verifies the request and delegates everything else
 * to lib/ingestion/apifyBridge.ts (kept separate so the bridge logic is unit
 * testable without simulating a full Next.js request).
 */
export async function POST(request: NextRequest) {
  if (!verifyApifyWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: ApifyWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const outcome = await processApifyWebhook(payload);
  return NextResponse.json(outcome, { status: STATUS_BY_OUTCOME[outcome.kind] });
}
