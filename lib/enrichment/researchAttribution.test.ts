import { describe, expect, it, vi, beforeEach } from "vitest";

const auditLogFindManyMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { auditLog: { findMany: (...args: unknown[]) => auditLogFindManyMock(...args) } },
}));

import { getResearchActivityForStagingIds, getResearchActivityForStagingId } from "./researchAttribution";
import { RESEARCH_ENTITY_TYPE, ENRICHMENT_HISTORY_ENTITY_TYPE } from "./enrichmentHistory";

function row(overrides: Partial<{ entityType: string; entityId: string; action: string; before: unknown; after: unknown; at: Date }>) {
  return {
    entityType: RESEARCH_ENTITY_TYPE,
    entityId: "staging-1",
    action: "research.started",
    before: null,
    after: {},
    at: new Date("2026-09-07T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getResearchActivityForStagingIds", () => {
  it("1. returns hasResearch=false when a project was merely enriched, never researched (no proposal_created row exists)", async () => {
    auditLogFindManyMock.mockResolvedValue([]);
    const result = await getResearchActivityForStagingIds(["staging-1"]);
    expect(result.get("staging-1")!.hasResearch).toBe(false);
    expect(result.get("staging-1")!.fields).toHaveLength(0);
  });

  it("2. hasResearch stays false when Research was run but found nothing new (research.started/completed with no proposal_created)", async () => {
    auditLogFindManyMock.mockResolvedValue([
      row({ action: "research.started", after: { fieldKeys: ["address"], providerNames: ["manual-submission"] } }),
      row({ action: "research.completed", after: { status: "NO_NEW_INFO", fieldKeys: ["address"], rejectedFindings: [] } }),
    ]);
    const result = await getResearchActivityForStagingIds(["staging-1"]);
    expect(result.get("staging-1")!.hasResearch).toBe(false);
  });

  it("3. a real proposal with no founder decision yet is PENDING", async () => {
    auditLogFindManyMock.mockResolvedValue([
      row({ action: "research.started", after: { fieldKeys: ["address"], providerNames: ["manual-submission"] } }),
      row({
        action: "research.proposal_created",
        after: { fieldKey: "address", proposedValue: "S.V. Road, Andheri West", classification: "GREEN_NEW", sourceUrl: "https://dev.example.com", confidence: "High" },
      }),
    ]);
    const result = await getResearchActivityForStagingIds(["staging-1"]);
    const activity = result.get("staging-1")!;
    expect(activity.hasResearch).toBe(true);
    expect(activity.providerLabel).toBe("Claude + Chrome");
    expect(activity.pending).toBe(1);
    expect(activity.fields[0]).toMatchObject({ fieldKey: "address", status: "PENDING", sourceUrl: "https://dev.example.com" });
  });

  it("4. a matching accept event (same fieldKey + sourceUrl) marks the field ACCEPTED", async () => {
    auditLogFindManyMock.mockResolvedValue([
      row({ action: "research.started", after: { providerNames: ["manual-submission"] } }),
      row({
        action: "research.proposal_created",
        after: { fieldKey: "address", proposedValue: "S.V. Road, Andheri West", classification: "GREEN_NEW", sourceUrl: "https://dev.example.com", confidence: "High" },
      }),
      row({
        entityType: ENRICHMENT_HISTORY_ENTITY_TYPE,
        action: "enrichment.accept",
        after: { fieldKey: "address", displayValue: "S.V. Road, Andheri West", sourceUrl: "https://dev.example.com", payloadChanges: {} },
        at: new Date("2026-09-07T00:05:00Z"),
      }),
    ]);
    const result = await getResearchActivityForStagingIds(["staging-1"]);
    const activity = result.get("staging-1")!;
    expect(activity.accepted).toBe(1);
    expect(activity.fields[0].status).toBe("ACCEPTED");
    expect(activity.fields[0].decidedAt).toBe("2026-09-07T00:05:00.000Z");
  });

  it("5. an accept with founderEdited:true is FOUNDER_EDITED, not ACCEPTED", async () => {
    auditLogFindManyMock.mockResolvedValue([
      row({ action: "research.proposal_created", after: { fieldKey: "startingPrice", classification: "YELLOW", sourceUrl: "https://x.com", proposedValue: "38 Cr" } }),
      row({
        entityType: ENRICHMENT_HISTORY_ENTITY_TYPE,
        action: "enrichment.edit_accept",
        after: { fieldKey: "startingPrice", displayValue: "38.5 Cr", sourceUrl: "https://x.com", founderEdited: true, overriddenValue: "38 Cr", payloadChanges: {} },
        at: new Date("2026-09-07T01:00:00Z"),
      }),
    ]);
    const result = await getResearchActivityForStagingIds(["staging-1"]);
    expect(result.get("staging-1")!.founderEdited).toBe(1);
    expect(result.get("staging-1")!.fields[0].status).toBe("FOUNDER_EDITED");
  });

  it("6. a reject event marks the field REJECTED", async () => {
    auditLogFindManyMock.mockResolvedValue([
      row({ action: "research.proposal_created", after: { fieldKey: "developer", classification: "CONFLICT", sourceUrl: "https://x.com" } }),
      row({
        entityType: ENRICHMENT_HISTORY_ENTITY_TYPE,
        action: "enrichment.reject",
        after: { fieldKey: "developer", reason: "Wrong project", sourceUrl: "https://x.com", payloadChanges: {} },
        at: new Date("2026-09-07T02:00:00Z"),
      }),
    ]);
    const result = await getResearchActivityForStagingIds(["staging-1"]);
    expect(result.get("staging-1")!.rejected).toBe(1);
    expect(result.get("staging-1")!.fields[0].status).toBe("REJECTED");
  });

  it("7. an unresolved CONFLICT-classified proposal with no decision yet is counted as CONFLICT, not PENDING", async () => {
    auditLogFindManyMock.mockResolvedValue([row({ action: "research.proposal_created", after: { fieldKey: "locality", classification: "CONFLICT", sourceUrl: "https://x.com" } })]);
    const result = await getResearchActivityForStagingIds(["staging-1"]);
    expect(result.get("staging-1")!.conflicts).toBe(1);
    expect(result.get("staging-1")!.fields[0].status).toBe("CONFLICT");
  });

  it("8. providerLabel falls back to the generic, still-truthful 'Research Agent' for any provider name other than manual-submission", async () => {
    auditLogFindManyMock.mockResolvedValue([
      row({ action: "research.started", after: { providerNames: ["future-search-api"] } }),
      row({ action: "research.proposal_created", after: { fieldKey: "amenities", classification: "GREEN_NEW", sourceUrl: "https://x.com" } }),
    ]);
    const result = await getResearchActivityForStagingIds(["staging-1"]);
    expect(result.get("staging-1")!.providerLabel).toBe("Research Agent");
  });

  it("9. rejectedByVerification sums real persisted rejectedFindings counts, never fabricated", async () => {
    auditLogFindManyMock.mockResolvedValue([
      row({ action: "research.proposal_created", after: { fieldKey: "amenities", classification: "GREEN_NEW", sourceUrl: "https://x.com" } }),
      row({ action: "research.completed", after: { status: "READY", rejectedFindings: [{ fieldKey: "developer", sourceUrl: "https://wrong.com", reason: "identity mismatch" }] } }),
    ]);
    const result = await getResearchActivityForStagingIds(["staging-1"]);
    expect(result.get("staging-1")!.rejectedByVerification).toBe(1);
  });

  it("10. one query serves multiple staging record ids, correctly partitioned per record", async () => {
    auditLogFindManyMock.mockResolvedValue([
      row({ entityId: "staging-1", action: "research.proposal_created", after: { fieldKey: "address", classification: "GREEN_NEW", sourceUrl: "https://a.com" } }),
      row({ entityId: "staging-2", action: "research.started", after: {} }),
    ]);
    const result = await getResearchActivityForStagingIds(["staging-1", "staging-2", "staging-3"]);
    expect(auditLogFindManyMock).toHaveBeenCalledTimes(1);
    expect(result.get("staging-1")!.hasResearch).toBe(true);
    expect(result.get("staging-2")!.hasResearch).toBe(false); // started but never produced a real proposal
    expect(result.get("staging-3")!.hasResearch).toBe(false); // no rows at all
  });

  it("11. empty input never queries the database", async () => {
    const result = await getResearchActivityForStagingIds([]);
    expect(result.size).toBe(0);
    expect(auditLogFindManyMock).not.toHaveBeenCalled();
  });

  it("13. hasFounderEdit is true project-wide even with zero research proposals -- a plain Enrich Project founder edit still counts", async () => {
    auditLogFindManyMock.mockResolvedValue([
      row({
        entityType: ENRICHMENT_HISTORY_ENTITY_TYPE,
        action: "enrichment.accept",
        after: { fieldKey: "tagline", displayValue: "Custom tagline", founderEdited: true, payloadChanges: {} },
      }),
    ]);
    const result = await getResearchActivityForStagingIds(["staging-1"]);
    const activity = result.get("staging-1")!;
    expect(activity.hasResearch).toBe(false);
    expect(activity.hasFounderEdit).toBe(true);
  });
});

describe("getResearchActivityForStagingId (single-record convenience wrapper)", () => {
  it("12. returns the same shape as the batched lookup for one id", async () => {
    auditLogFindManyMock.mockResolvedValue([row({ action: "research.proposal_created", after: { fieldKey: "address", classification: "GREEN_NEW", sourceUrl: "https://a.com" } })]);
    const result = await getResearchActivityForStagingId("staging-1");
    expect(result.hasResearch).toBe(true);
    expect(result.fields[0].fieldKey).toBe("address");
  });
});
