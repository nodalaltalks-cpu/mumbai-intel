import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocked BEFORE importing the module under test — vitest hoists vi.mock calls,
// but being explicit about the module shape here keeps the test readable.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ingestBatch: { findFirst: vi.fn() },
  },
}));
vi.mock("./fileImportRunner", () => ({
  runProjectFileImport: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { runProjectFileImport } from "./fileImportRunner";
import { processApifyWebhook, type ApifyWebhookPayload } from "./apifyBridge";
import { verifyApifyWebhookSecret } from "@/lib/verify-apify-webhook-secret";

const findFirstMock = vi.mocked(prisma.ingestBatch.findFirst);
const runProjectFileImportMock = vi.mocked(runProjectFileImport);

const SUCCEEDED_PAYLOAD: ApifyWebhookPayload = {
  eventType: "ACTOR.RUN.SUCCEEDED",
  resource: {
    id: "run123",
    actId: "actorABC",
    status: "SUCCEEDED",
    defaultDatasetId: "dataset789",
  },
};

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
  const { ok = true, status = 200, statusText = "OK" } = init;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      statusText,
      json: async () => body,
    })
  );
}

describe("verifyApifyWebhookSecret", () => {
  const ORIGINAL_SECRET = process.env.APIFY_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.APIFY_WEBHOOK_SECRET = "test-secret-123";
  });
  afterEach(() => {
    process.env.APIFY_WEBHOOK_SECRET = ORIGINAL_SECRET;
  });

  it("1. rejects an unauthorized webhook (missing/wrong bearer secret)", () => {
    const requestNoHeader = new Request("https://example.com/api/ingest/apify", { method: "POST" });
    expect(verifyApifyWebhookSecret(requestNoHeader)).toBe(false);

    const requestWrongSecret = new Request("https://example.com/api/ingest/apify", {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
    });
    expect(verifyApifyWebhookSecret(requestWrongSecret)).toBe(false);
  });

  it("2. accepts an authorized webhook (correct bearer secret)", () => {
    const request = new Request("https://example.com/api/ingest/apify", {
      method: "POST",
      headers: { authorization: "Bearer test-secret-123" },
    });
    expect(verifyApifyWebhookSecret(request)).toBe(true);
  });

  it("rejects everything when APIFY_WEBHOOK_SECRET is not configured", () => {
    delete process.env.APIFY_WEBHOOK_SECRET;
    const request = new Request("https://example.com/api/ingest/apify", {
      method: "POST",
      headers: { authorization: "Bearer anything" },
    });
    expect(verifyApifyWebhookSecret(request)).toBe(false);
  });
});

describe("processApifyWebhook", () => {
  const ORIGINAL_TOKEN = process.env.APIFY_API_TOKEN;

  beforeEach(() => {
    process.env.APIFY_API_TOKEN = "test-apify-token";
    findFirstMock.mockReset();
    runProjectFileImportMock.mockReset();
  });
  afterEach(() => {
    process.env.APIFY_API_TOKEN = ORIGINAL_TOKEN;
    vi.unstubAllGlobals();
  });

  it("rejects a payload missing run/actor identifiers (invalid_payload)", async () => {
    const outcome = await processApifyWebhook({ resource: { status: "SUCCEEDED" } });
    expect(outcome.kind).toBe("invalid_payload");
    expect(runProjectFileImportMock).not.toHaveBeenCalled();
  });

  it("6. skips a failed Apify run without importing anything", async () => {
    findFirstMock.mockResolvedValue(null);
    const outcome = await processApifyWebhook({
      resource: { id: "run1", actId: "actorABC", status: "FAILED" },
    });
    expect(outcome.kind).toBe("run_not_succeeded");
    expect(runProjectFileImportMock).not.toHaveBeenCalled();
  });

  it("7. skips a duplicate webhook delivery for an already-processed run", async () => {
    findFirstMock.mockResolvedValue({ id: "existing-batch-1" } as never);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const outcome = await processApifyWebhook(SUCCEEDED_PAYLOAD);
    expect(outcome).toMatchObject({ kind: "duplicate", batchId: "existing-batch-1" });
    expect(runProjectFileImportMock).not.toHaveBeenCalled();
    // Must not even attempt to reach Apify's API for an already-processed run.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("4. treats an empty dataset as a safe no-op, not an import attempt", async () => {
    findFirstMock.mockResolvedValue(null);
    mockFetchOnce([]);
    const outcome = await processApifyWebhook(SUCCEEDED_PAYLOAD);
    expect(outcome.kind).toBe("empty_dataset");
    expect(runProjectFileImportMock).not.toHaveBeenCalled();
  });

  it("malformed/unexpected dataset response shape is rejected, not imported (dataset_fetch_failed)", async () => {
    findFirstMock.mockResolvedValue(null);
    mockFetchOnce({ notAnArray: true }); // Apify API contract violated -- must not be treated as rows
    const outcome = await processApifyWebhook(SUCCEEDED_PAYLOAD);
    expect(outcome.kind).toBe("dataset_fetch_failed");
    expect(runProjectFileImportMock).not.toHaveBeenCalled();
  });

  it("reports a failed Apify API call safely (dataset_fetch_failed) without importing", async () => {
    findFirstMock.mockResolvedValue(null);
    mockFetchOnce(null, { ok: false, status: 500, statusText: "Internal Server Error" });
    const outcome = await processApifyWebhook(SUCCEEDED_PAYLOAD);
    expect(outcome.kind).toBe("dataset_fetch_failed");
    expect(runProjectFileImportMock).not.toHaveBeenCalled();
  });

  it("reports missing APIFY_API_TOKEN as a config error, never silently skipping auth", async () => {
    delete process.env.APIFY_API_TOKEN;
    findFirstMock.mockResolvedValue(null);
    const outcome = await processApifyWebhook(SUCCEEDED_PAYLOAD);
    expect(outcome.kind).toBe("config_error");
    expect(runProjectFileImportMock).not.toHaveBeenCalled();
  });

  it("8. surfaces an importer failure instead of swallowing it", async () => {
    findFirstMock.mockResolvedValue(null);
    mockFetchOnce([{ name: "Test Project" }]);
    runProjectFileImportMock.mockRejectedValue(new Error("Primary city is not seeded"));
    const outcome = await processApifyWebhook(SUCCEEDED_PAYLOAD);
    expect(outcome).toMatchObject({ kind: "import_failed", error: "Primary city is not seeded" });
  });

  it("3, 9, 10. on a successful run, fetches the dataset and hands it to the EXISTING importer with the correct shape and data source", async () => {
    findFirstMock
      .mockResolvedValueOnce(null) // pre-import dedup check: not seen before
      .mockResolvedValueOnce({ id: "batch-xyz" } as never); // post-import lookup for logging/response
    const items = [
      { name: "Test Project One", localityName: "Andheri West", status: "READY_TO_MOVE" },
      { name: "Test Project Two", localityName: "Powai", status: "UNDER_CONSTRUCTION" },
    ];
    mockFetchOnce(items);
    runProjectFileImportMock.mockResolvedValue({ written: 0, skipped: 0, staged: 2, failed: 0 });

    const outcome = await processApifyWebhook(SUCCEEDED_PAYLOAD);

    expect(runProjectFileImportMock).toHaveBeenCalledTimes(1);
    const call = runProjectFileImportMock.mock.calls[0][0];
    // 10. Same JSON-file shape the existing CSV/JSON upload path already accepts.
    expect(call.fileFormat).toBe("json");
    expect(JSON.parse(call.fileText)).toEqual(items);
    // 9. Correct provenance for externally-scraped data.
    expect(call.dataSource).toBe("EXTERNAL_OPEN_DATA");
    // Unattended run, not a human upload.
    expect(call.trigger).toBe("scheduled");
    expect(call.triggeredByUserId).toBeUndefined();
    // Idempotent, traceable sourceKey unique to this (actor, run).
    expect(call.sourceKey).toBe("apify:actorABC:run123");

    expect(outcome).toMatchObject({
      kind: "imported",
      batchId: "batch-xyz",
      received: 2,
      summary: { staged: 2, failed: 0 },
    });
  });
});
