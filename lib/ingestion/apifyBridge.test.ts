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

/**
 * Phase 12 wiring tests: MagicBricks listing-level datasets get grouped by
 * normalizeMagicBricksListings() BEFORE reaching the existing, unmodified
 * runProjectFileImport() -- and every other Actor (actorId not matching the
 * configured MAGICBRICKS_ACTOR_ID) is completely unaffected. No real Apify,
 * MagicBricks, or database call happens anywhere in this suite --
 * runProjectFileImport and prisma are both mocked at the top of this file, so
 * these tests prove the wiring in code only, exactly as Phase 12 requires.
 */
describe("processApifyWebhook — MagicBricks normalizer wiring (Phase 12)", () => {
  const ORIGINAL_TOKEN = process.env.APIFY_API_TOKEN;
  const ORIGINAL_ACTOR_ID = process.env.MAGICBRICKS_ACTOR_ID;
  const ORIGINAL_STATUS_FILTER = process.env.MAGICBRICKS_STATUS_FILTER;

  const MAGICBRICKS_ACTOR_ID = "tS390odqBHZM5OEgn";
  const MAGICBRICKS_PAYLOAD: ApifyWebhookPayload = {
    resource: { id: "mbRun1", actId: MAGICBRICKS_ACTOR_ID, status: "SUCCEEDED", defaultDatasetId: "mbDataset1" },
  };

  const ADANI_LISTING_1 = {
    listing_id: "86171227",
    project_name: "Adani Linkbay Residences",
    developer: "Adani Realty & RC Group",
    locality: "Andheri West",
    rera_id: "P51800047539, PR1181012501116",
    possession_date: "Oct '28",
    price_inr: 69900000,
  };
  const ADANI_LISTING_2 = {
    listing_id: "85827069",
    project_name: "Adani Linkbay Residences",
    developer: "Adani Realty & RC Group",
    locality: "Andheri West",
    rera_id: "P51800047539, PR1181012501116",
    possession_date: "Oct '28",
    price_inr: 44608000,
  };
  const GURUKRUPA_LISTING = {
    listing_id: "86008141",
    project_name: "Gurukrupa Ekam",
    developer: "Gurukrupa Realcon",
    locality: "Andheri West",
    rera_id: "PM1180002501525",
    possession_date: "Apr '29",
    price_inr: 32600000,
  };

  beforeEach(() => {
    process.env.APIFY_API_TOKEN = "test-apify-token";
    process.env.MAGICBRICKS_ACTOR_ID = MAGICBRICKS_ACTOR_ID;
    process.env.MAGICBRICKS_STATUS_FILTER = "under-construction";
    findFirstMock.mockReset();
    runProjectFileImportMock.mockReset();
  });
  afterEach(() => {
    process.env.APIFY_API_TOKEN = ORIGINAL_TOKEN;
    process.env.MAGICBRICKS_ACTOR_ID = ORIGINAL_ACTOR_ID;
    process.env.MAGICBRICKS_STATUS_FILTER = ORIGINAL_STATUS_FILTER;
    vi.unstubAllGlobals();
  });

  it("1+2. recognizes a MagicBricks run by configured actorId and hands its raw listings to the normalizer, not straight to the importer", async () => {
    findFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "batch-1" } as never);
    mockFetchOnce([ADANI_LISTING_1]);
    runProjectFileImportMock.mockResolvedValue({ written: 0, skipped: 0, staged: 1, failed: 0 });

    await processApifyWebhook(MAGICBRICKS_PAYLOAD);

    expect(runProjectFileImportMock).toHaveBeenCalledTimes(1);
    const call = runProjectFileImportMock.mock.calls[0][0];
    const rows = JSON.parse(call.fileText);
    // Normalized row, NOT the raw listing shape (no listing_id/price_inr/rera_id survive raw).
    expect(rows).toEqual([
      expect.objectContaining({
        name: "Adani Linkbay Residences",
        locality: "Andheri West",
        status: "Under Construction",
        rera: "P51800047539",
        possession: "2028-10-01",
      }),
    ]);
    expect(rows[0].listing_id).toBeUndefined();
    expect(rows[0].price_inr).toBeUndefined();
  });

  it("3. two listings for the same project become one candidate row", async () => {
    findFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "batch-2" } as never);
    mockFetchOnce([ADANI_LISTING_1, ADANI_LISTING_2]);
    runProjectFileImportMock.mockResolvedValue({ written: 0, skipped: 0, staged: 1, failed: 0 });

    await processApifyWebhook(MAGICBRICKS_PAYLOAD);

    const rows = JSON.parse(runProjectFileImportMock.mock.calls[0][0].fileText);
    expect(rows).toHaveLength(1);
    expect(rows[0]["price min"]).toBe(44608000);
    expect(rows[0]["price max"]).toBe(69900000);
  });

  it("4. multiple distinct projects remain separate candidate rows", async () => {
    findFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "batch-3" } as never);
    mockFetchOnce([ADANI_LISTING_1, GURUKRUPA_LISTING]);
    runProjectFileImportMock.mockResolvedValue({ written: 0, skipped: 0, staged: 2, failed: 0 });

    await processApifyWebhook(MAGICBRICKS_PAYLOAD);

    const rows = JSON.parse(runProjectFileImportMock.mock.calls[0][0].fileText);
    expect(rows.map((r: { name: string }) => r.name).sort()).toEqual(["Adani Linkbay Residences", "Gurukrupa Ekam"]);
  });

  it("5+9. the existing, unmodified runProjectFileImport() is still the only thing that validates/stages -- normalizer never calls it or writes anywhere itself", async () => {
    findFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "batch-4" } as never);
    mockFetchOnce([GURUKRUPA_LISTING]);
    runProjectFileImportMock.mockResolvedValue({ written: 0, skipped: 0, staged: 1, failed: 0 });

    const outcome = await processApifyWebhook(MAGICBRICKS_PAYLOAD);

    expect(runProjectFileImportMock).toHaveBeenCalledTimes(1);
    expect(runProjectFileImportMock.mock.calls[0][0].dataSource).toBe("EXTERNAL_OPEN_DATA");
    expect(runProjectFileImportMock.mock.calls[0][0].trigger).toBe("scheduled");
    expect(outcome.kind).toBe("imported");
  });

  it("6. non-MagicBricks actor runs are completely unaffected -- raw items pass through unchanged", async () => {
    findFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "batch-5" } as never);
    const otherActorPayload: ApifyWebhookPayload = {
      resource: { id: "run999", actId: "some-other-actor-id", status: "SUCCEEDED", defaultDatasetId: "ds999" },
    };
    const items = [{ name: "Manual Test Project", localityName: "Chembur", status: "READY_TO_MOVE" }];
    mockFetchOnce(items);
    runProjectFileImportMock.mockResolvedValue({ written: 0, skipped: 0, staged: 1, failed: 0 });

    await processApifyWebhook(otherActorPayload);

    const call = runProjectFileImportMock.mock.calls[0][0];
    expect(JSON.parse(call.fileText)).toEqual(items); // untouched by the MagicBricks normalizer
  });

  it("6b. an unset MAGICBRICKS_ACTOR_ID means no run is ever treated as MagicBricks, even the same actorId used in Phase 10E's real test", async () => {
    delete process.env.MAGICBRICKS_ACTOR_ID;
    findFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "batch-6" } as never);
    mockFetchOnce([ADANI_LISTING_1]);
    runProjectFileImportMock.mockResolvedValue({ written: 0, skipped: 0, staged: 0, failed: 1 });

    await processApifyWebhook(MAGICBRICKS_PAYLOAD);

    const call = runProjectFileImportMock.mock.calls[0][0];
    expect(JSON.parse(call.fileText)).toEqual([ADANI_LISTING_1]); // raw listing, never normalized
  });

  it("7. an empty MagicBricks dataset is still the existing safe no-op, never reaching the normalizer", async () => {
    findFirstMock.mockResolvedValue(null);
    mockFetchOnce([]);

    const outcome = await processApifyWebhook(MAGICBRICKS_PAYLOAD);

    expect(outcome.kind).toBe("empty_dataset");
    expect(runProjectFileImportMock).not.toHaveBeenCalled();
  });

  it("8. conflicting records (different RERA, same project+locality) are never silently merged -- surfaced as magicbricks_unresolved, not imported", async () => {
    findFirstMock.mockResolvedValue(null);
    const conflicting = { ...ADANI_LISTING_2, rera_id: "P99999999999" };
    mockFetchOnce([ADANI_LISTING_1, conflicting]);

    const outcome = await processApifyWebhook(MAGICBRICKS_PAYLOAD);

    expect(outcome).toMatchObject({ kind: "magicbricks_unresolved", conflictCount: 1, unresolvedCount: 0 });
    expect(runProjectFileImportMock).not.toHaveBeenCalled();
  });

  it("all-unresolved dataset (no project_name anywhere) is never imported as garbage rows", async () => {
    findFirstMock.mockResolvedValue(null);
    mockFetchOnce([{ locality: "Andheri West", price_inr: 100 }]);

    const outcome = await processApifyWebhook(MAGICBRICKS_PAYLOAD);

    expect(outcome).toMatchObject({ kind: "magicbricks_unresolved", unresolvedCount: 1, conflictCount: 0 });
    expect(runProjectFileImportMock).not.toHaveBeenCalled();
  });

  it("refuses to guess a status when MAGICBRICKS_STATUS_FILTER is unset -- config_error, not a default assumption", async () => {
    delete process.env.MAGICBRICKS_STATUS_FILTER;
    findFirstMock.mockResolvedValue(null);
    mockFetchOnce([ADANI_LISTING_1]);

    const outcome = await processApifyWebhook(MAGICBRICKS_PAYLOAD);

    expect(outcome.kind).toBe("config_error");
    expect(runProjectFileImportMock).not.toHaveBeenCalled();
  });

  it("10. no database writes occur -- prisma and runProjectFileImport are fully mocked for every case in this suite", () => {
    expect(vi.isMockFunction(runProjectFileImportMock)).toBe(true);
    expect(vi.isMockFunction(findFirstMock)).toBe(true);
  });
});
