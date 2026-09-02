import { describe, expect, it } from "vitest";
import { runWithConcurrency } from "./runWithConcurrency";

describe("runWithConcurrency", () => {
  it("never exceeds the given concurrency limit", async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await runWithConcurrency(items, 3, async (i) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return i * 2;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("returns results in original index order regardless of completion order", async () => {
    const items = [30, 10, 20];
    const results = await runWithConcurrency(items, 3, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    expect(results.map((r) => r.result)).toEqual([30, 10, 20]);
  });

  it("isolates a failure — one item's rejection never aborts the others", async () => {
    const items = [1, 2, 3];
    const results = await runWithConcurrency(items, 2, async (i) => {
      if (i === 2) throw new Error("boom");
      return i;
    });
    expect(results[0]).toEqual({ index: 0, result: 1, error: null });
    expect(results[1].error).toBe("boom");
    expect(results[1].result).toBeNull();
    expect(results[2]).toEqual({ index: 2, result: 3, error: null });
  });

  it("handles an empty item list without hanging", async () => {
    const results = await runWithConcurrency([], 3, async () => 1);
    expect(results).toEqual([]);
  });
});
