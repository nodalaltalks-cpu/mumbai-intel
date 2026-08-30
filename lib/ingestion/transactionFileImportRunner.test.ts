import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked BEFORE importing the module under test, matching the existing
// apifyBridge.test.ts convention. Entirely synthetic data throughout --
// nothing here ever touches a real database.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    city: { findUnique: vi.fn() },
    locality: { findMany: vi.fn() },
    project: { findMany: vi.fn() },
    transaction: { findMany: vi.fn() },
    ingestStagingRecord: { findMany: vi.fn(), create: vi.fn() },
    ingestBatch: { create: vi.fn(), update: vi.fn() },
    ingestLogEntry: { create: vi.fn() },
  },
}));
vi.mock("@/lib/queries", () => ({ PRIMARY_CITY_SLUG: "mumbai" }));

import { prisma } from "@/lib/prisma";
import { runTransactionFileImport } from "./transactionFileImportRunner";

const cityFindUniqueMock = vi.mocked(prisma.city.findUnique);
const localityFindManyMock = vi.mocked(prisma.locality.findMany);
const projectFindManyMock = vi.mocked(prisma.project.findMany);
const transactionFindManyMock = vi.mocked(prisma.transaction.findMany);
const stagingFindManyMock = vi.mocked(prisma.ingestStagingRecord.findMany);
const stagingCreateMock = vi.mocked(prisma.ingestStagingRecord.create);
const batchCreateMock = vi.mocked(prisma.ingestBatch.create);
const batchUpdateMock = vi.mocked(prisma.ingestBatch.update);
const logEntryCreateMock = vi.mocked(prisma.ingestLogEntry.create);

const ANDHERI_LOCALITY = { id: "loc-andheri", name: "Andheri West", aliases: [{ alias: "Andheri W." }] };
const GODREJ_PROJECT = { id: "proj-godrej", name: "Godrej Sky Shore" };

/** Captures every IngestStagingRecord the run tried to create, in call order. */
function stagedPayloads(): { data: Record<string, unknown> }[] {
  return stagingCreateMock.mock.calls.map(([call]) => call as { data: Record<string, unknown> });
}

beforeEach(() => {
  vi.clearAllMocks();
  cityFindUniqueMock.mockResolvedValue({ id: "city-mumbai" } as never);
  localityFindManyMock.mockResolvedValue([ANDHERI_LOCALITY] as never);
  projectFindManyMock.mockResolvedValue([GODREJ_PROJECT] as never);
  transactionFindManyMock.mockResolvedValue([] as never);
  stagingFindManyMock.mockResolvedValue([] as never);
  batchCreateMock.mockResolvedValue({ id: "batch-1" } as never);
  batchUpdateMock.mockResolvedValue({} as never);
  logEntryCreateMock.mockResolvedValue({} as never);
  let counter = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stagingCreateMock.mockImplementation((async () => ({ id: `staged-${++counter}` })) as any);
});

function runImport(rows: Record<string, unknown>[]) {
  return runTransactionFileImport({
    sourceKey: "test-igr-batch",
    fileText: JSON.stringify(rows),
    fileFormat: "json",
    dataSource: "OFFICIAL_GOVERNMENT",
    triggeredByUserId: "user-1",
  });
}

describe("runTransactionFileImport — Phase 19 synthetic scenarios (Part N)", () => {
  it("1. valid transaction — every field present, including the new IGR fields, stages cleanly", async () => {
    const summary = await runImport([
      {
        locality: "Andheri West",
        project: "Godrej Sky Shore",
        type: "sale",
        "registration date": "2026-01-15",
        value: 25000000,
        "carpet sqft": 950,
        bedrooms: 2,
        tower: "B",
        "unit label": "B-1204",
        "registration number": "IGR-2026-000001",
        confidence: "HIGH",
        "source note": "From IGR free-search, manually copied.",
      },
    ]);

    expect(summary).toEqual({ written: 0, skipped: 0, staged: 1, failed: 0 });
    const [record] = stagedPayloads();
    const payload = record.data.payload as Record<string, unknown>;
    expect(payload.localityId).toBe("loc-andheri");
    expect(payload.projectId).toBe("proj-godrej");
    expect(payload.sourceRef).toBe("IGR-2026-000001");
    expect(payload.confidence).toBe("HIGH");
    expect(payload.sourceNote).toBe("From IGR free-search, manually copied.");
    expect(record.data.matchedExistingId).toBeNull();
  });

  it("2. missing required field (value) fails that row without aborting the batch", async () => {
    const summary = await runImport([{ locality: "Andheri West", type: "sale", "registration date": "2026-01-15" }]);
    expect(summary).toEqual({ written: 0, skipped: 0, staged: 0, failed: 1 });
    expect(stagingCreateMock).not.toHaveBeenCalled();
    expect(logEntryCreateMock.mock.calls[0][0]).toMatchObject({
      data: expect.objectContaining({ action: "FAILED", message: expect.stringContaining("Missing transaction value") }),
    });
  });

  it("2b. missing OPTIONAL fields (bedrooms/tower/unit label) still stages, just without those keys", async () => {
    const summary = await runImport([
      { locality: "Andheri West", type: "sale", "registration date": "2026-01-15", value: 25000000 },
    ]);
    expect(summary.staged).toBe(1);
    const [record] = stagedPayloads();
    const payload = record.data.payload as Record<string, unknown>;
    expect(payload.bedrooms).toBeUndefined();
    expect(payload.tower).toBeUndefined();
    expect(payload.unitLabel).toBeUndefined();
  });

  it("3. duplicate transaction — same registration number as a PENDING staging record is staged (not skipped) and flagged", async () => {
    stagingFindManyMock.mockResolvedValue([
      { id: "staged-pending-1", payload: { sourceRef: "IGR-2026-000123" } },
    ] as never);

    const summary = await runImport([
      {
        locality: "Andheri West",
        type: "sale",
        "registration date": "2026-02-01",
        value: 30000000, // deliberately different value from whatever staged-pending-1 might hold
        "registration number": "IGR-2026-000123",
      },
    ]);

    expect(summary.staged).toBe(1);
    expect(summary.skipped).toBe(0);
    const [record] = stagedPayloads();
    expect(record.data.matchedExistingId).toBe("staged-pending-1");
    expect(record.data.matchConfidence).toBe(1);
  });

  it("3b. identical content with no registration number (pure hash match) is silently skipped as a true duplicate", async () => {
    const row = { locality: "Andheri West", type: "sale", "registration date": "2026-01-15", value: 25000000 };
    const summary = await runImport([row, row]);
    expect(summary.staged).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(stagingCreateMock).toHaveBeenCalledTimes(1);
  });

  it("3c. registration number matching an already-approved LIVE transaction is staged with a source-note warning, never silently skipped or merged", async () => {
    transactionFindManyMock.mockResolvedValue([{ id: "txn-live-1", sourceRef: "IGR-2026-000999" }] as never);

    const summary = await runImport([
      {
        locality: "Andheri West",
        type: "resale",
        "registration date": "2026-03-01",
        value: 40000000,
        "registration number": "IGR-2026-000999",
      },
    ]);

    expect(summary.staged).toBe(1);
    expect(summary.skipped).toBe(0);
    const [record] = stagedPayloads();
    const payload = record.data.payload as Record<string, unknown>;
    expect(payload.sourceNote).toContain("txn-live-1");
    expect(record.data.matchedExistingId).toBeNull(); // can't point matchedExistingId at a live Transaction, per design
  });

  it("4. unknown project — stages anyway with projectId left unresolved (never fabricated, never fails the row)", async () => {
    const summary = await runImport([
      {
        locality: "Andheri West",
        project: "Some Project Nobody Has Heard Of",
        type: "sale",
        "registration date": "2026-01-15",
        value: 25000000,
      },
    ]);
    expect(summary.staged).toBe(1);
    expect(summary.failed).toBe(0);
    const [record] = stagedPayloads();
    expect((record.data.payload as Record<string, unknown>).projectId).toBeUndefined();
  });

  it("5. unknown locality fails the row (locality is required to stage a Transaction)", async () => {
    const summary = await runImport([
      { locality: "Nowhere Land", type: "sale", "registration date": "2026-01-15", value: 25000000 },
    ]);
    expect(summary.failed).toBe(1);
    expect(summary.staged).toBe(0);
    expect(logEntryCreateMock.mock.calls[0][0]).toMatchObject({
      data: expect.objectContaining({ message: expect.stringContaining('locality "Nowhere Land" not found') }),
    });
  });

  it("5b. a known LocalityAlias spelling ('Andheri W.') resolves correctly via the existing LocalityAlias table", async () => {
    const summary = await runImport([
      { locality: "Andheri W.", type: "sale", "registration date": "2026-01-15", value: 25000000 },
    ]);
    expect(summary.staged).toBe(1);
    const [record] = stagedPayloads();
    expect((record.data.payload as Record<string, unknown>).localityId).toBe("loc-andheri");
  });

  it("6. an ambiguous/unparseable date format fails safely rather than being silently misinterpreted", async () => {
    // JS Date() cannot parse DD/MM/YYYY (only MM/DD/YYYY or ISO) -- "15/01/2026"
    // must fail validation, not silently become some other date.
    const summary = await runImport([
      { locality: "Andheri West", type: "sale", "registration date": "15/01/2026", value: 25000000 },
    ]);
    expect(summary.failed).toBe(1);
    expect(summary.staged).toBe(0);
  });

  it("7. a currency-formatted value (with symbol/commas) fails safely rather than being silently parsed", async () => {
    const summary = await runImport([
      { locality: "Andheri West", type: "sale", "registration date": "2026-01-15", value: "₹2,50,00,000" },
    ]);
    expect(summary.failed).toBe(1);
    expect(summary.staged).toBe(0);
  });

  it("8. a non-numeric area format fails safely rather than being silently parsed", async () => {
    const summary = await runImport([
      { locality: "Andheri West", type: "sale", "registration date": "2026-01-15", value: 25000000, "carpet sqft": "950 sq.ft" },
    ]);
    expect(summary.failed).toBe(1);
    expect(summary.staged).toBe(0);
  });
});
