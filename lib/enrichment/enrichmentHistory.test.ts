import { describe, expect, it, vi } from "vitest";

// enrichmentHistory.ts imports getAuditHistory from lib/admin-queries.ts,
// which (transitively) constructs a real PrismaClient at import time --
// mocked purely to satisfy that import, matching the existing
// lib/actions/enrichment.test.ts convention. The pure functions tested below
// never call this mock.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  actionTypeToStoredAction,
  applyStorableChanges,
  computePayloadDiff,
  determineAcceptActionType,
  toStorableChanges,
  type EnrichmentHistoryEntry,
} from "./enrichmentHistory";

describe("computePayloadDiff (Phase 37 — the single mechanism both history-writing and Undo restoration rely on)", () => {
  it("returns only the keys that actually changed", () => {
    const before = { name: "Godrej Sky Shore", priceMinRupees: 84000000, tagline: undefined };
    const after = { name: "Godrej Sky Shore", priceMinRupees: 84000000, tagline: "A shoreline sanctuary" };
    const diff = computePayloadDiff(before, after);
    expect(diff).toEqual([{ key: "tagline", before: undefined, after: "A shoreline sanctuary" }]);
  });

  it("11. captures an array-valued change exactly (arrays restore exactly)", () => {
    const before = { amenities: undefined };
    const after = { amenities: ["Squash Court", "Library", "Gym"] };
    const diff = computePayloadDiff(before, after);
    expect(diff).toEqual([{ key: "amenities", before: undefined, after: ["Squash Court", "Library", "Gym"] }]);
  });

  it("12. captures a numeric change exactly", () => {
    const diff = computePayloadDiff({ landAreaAcres: undefined }, { landAreaAcres: 2.5 });
    expect(diff).toEqual([{ key: "landAreaAcres", before: undefined, after: 2.5 }]);
  });

  it("13. captures an enum-key change exactly (not the display label)", () => {
    const diff = computePayloadDiff({ status: "UNDER_CONSTRUCTION" }, { status: "READY_TO_MOVE" });
    expect(diff).toEqual([{ key: "status", before: "UNDER_CONSTRUCTION", after: "READY_TO_MOVE" }]);
  });

  it("preserves an explicit null the same as any other value", () => {
    const diff = computePayloadDiff({ builderId: "bldr-old" }, { builderId: null });
    expect(diff).toEqual([{ key: "builderId", before: "bldr-old", after: null }]);
  });

  it("returns an empty array when nothing changed", () => {
    expect(computePayloadDiff({ a: 1, b: "x" }, { a: 1, b: "x" })).toEqual([]);
  });
});

describe("toStorableChanges / applyStorableChanges (Phase 37 — 'genuinely blank' must survive JSON storage and restore as absent, never as null/empty-string)", () => {
  it("14. a genuinely absent (undefined) value round-trips through storage and restores by DELETING the key, not merely skipping it", () => {
    const stored = toStorableChanges([{ key: "tagline", value: undefined }]);
    // Plain `undefined` cannot survive Prisma's Json column -- confirm the
    // stored form is JSON-safe (a real string marker, not `undefined` itself,
    // which JSON.stringify would silently drop).
    expect(JSON.parse(JSON.stringify(stored))).toEqual(stored);

    const target = { tagline: "Accepted tagline", name: "Godrej Sky Shore" };
    const restored = applyStorableChanges(target, stored);
    expect(Object.prototype.hasOwnProperty.call(restored, "tagline")).toBe(false);
    expect(restored.name).toBe("Godrej Sky Shore"); // untouched
  });

  it("a real value (including null, 0, or an empty array) round-trips and restores exactly, never confused with 'absent'", () => {
    const stored = toStorableChanges([
      { key: "builderId", value: null },
      { key: "constructionPercent", value: 0 },
      { key: "amenities", value: [] },
    ]);
    const restored = applyStorableChanges({}, stored);
    expect(restored.builderId).toBeNull();
    expect(restored.constructionPercent).toBe(0);
    expect(restored.amenities).toEqual([]);
  });

  it("11/12/13. restores arrays, numbers, and enum-key strings exactly, byte-for-byte", () => {
    const stored = toStorableChanges([
      { key: "amenities", value: ["Squash Court", "Gym"] },
      { key: "landAreaAcres", value: 2.5 },
      { key: "status", value: "READY_TO_MOVE" },
    ]);
    const restored = applyStorableChanges({}, stored);
    expect(restored.amenities).toEqual(["Squash Court", "Gym"]);
    expect(restored.landAreaAcres).toBe(2.5);
    expect(restored.status).toBe("READY_TO_MOVE");
  });

  it("does not touch keys the change set never mentions", () => {
    const restored = applyStorableChanges({ name: "Godrej Sky Shore", localityId: "loc-1" }, toStorableChanges([{ key: "tagline", value: "x" }]));
    expect(restored.name).toBe("Godrej Sky Shore");
    expect(restored.localityId).toBe("loc-1");
  });
});

function entry(action: EnrichmentHistoryEntry["action"]): EnrichmentHistoryEntry {
  return { id: "evt-1", action, at: new Date().toISOString(), actorName: "Founder", before: null, after: null };
}

describe("determineAcceptActionType (Phase 37 — ACCEPT vs EDIT_ACCEPT vs RE_ACCEPT)", () => {
  it("1. no prior history -> ACCEPT (first acceptance)", () => {
    expect(determineAcceptActionType(null)).toBe("ACCEPT");
  });

  it("5/10. prior history exists, most recent was ACCEPT -> EDIT_ACCEPT", () => {
    expect(determineAcceptActionType(entry("ACCEPT"))).toBe("EDIT_ACCEPT");
  });

  it("10. prior history exists, most recent was EDIT_ACCEPT -> EDIT_ACCEPT again (sequential edits keep the same type)", () => {
    expect(determineAcceptActionType(entry("EDIT_ACCEPT"))).toBe("EDIT_ACCEPT");
  });

  it("9. most recent event was REVERT -> RE_ACCEPT", () => {
    expect(determineAcceptActionType(entry("REVERT"))).toBe("RE_ACCEPT");
  });

  it("most recent event was RE_ACCEPT itself -> a further accept is EDIT_ACCEPT, not RE_ACCEPT again", () => {
    expect(determineAcceptActionType(entry("RE_ACCEPT"))).toBe("EDIT_ACCEPT");
  });
});

describe("actionTypeToStoredAction (explicit, typed action names -- never ambiguous free text)", () => {
  it("maps every action type to a distinct, namespaced stored string", () => {
    const stored = new Set(
      (["ACCEPT", "EDIT_ACCEPT", "REVERT", "RE_ACCEPT"] as const).map((t) => actionTypeToStoredAction(t))
    );
    expect(stored.size).toBe(4);
    for (const s of stored) expect(s.startsWith("enrichment.")).toBe(true);
  });
});
