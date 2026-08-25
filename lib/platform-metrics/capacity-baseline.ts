import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Part I — "distinguish CURRENT OBSERVED LOAD from HIGHEST SUCCESSFULLY
 * TESTED LOAD". Reuses the existing generic SiteSetting key-value table
 * (same pattern as lib/recommendations/ml/mode.ts) rather than a new
 * table — this is Founder-editable config, not a metric this app measures
 * itself, so it belongs alongside every other admin-editable setting.
 *
 * Seeded with the real Phase 2 result: 50 concurrent HTTP requests,
 * measured against a local server connected to the actual production
 * database (not the deployed Vercel environment — see `notes`), zero
 * errors at that level, MEDIUM confidence. This is a real measurement,
 * not a placeholder — see the Phase 2 report for methodology.
 *
 * IMPORTANT UNIT DISTINCTION the dashboard must never blur: "highest
 * tested" is concurrent HTTP REQUESTS in a synthetic burst, not concurrent
 * ACTIVE USERS (a real user issues occasional requests, not a constant
 * open connection) — these are related but not the same number, and
 * conflating them would be exactly the fabricated-capacity-number problem
 * this whole system is designed to avoid.
 */
const KEYS = {
  concurrency: "capacity_highest_tested_concurrency",
  testedAt: "capacity_tested_at",
  confidence: "capacity_test_confidence",
  notes: "capacity_test_notes",
} as const;

export type CapacityConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface CapacityBaseline {
  highestTestedConcurrency: number | null;
  testedAt: Date | null;
  confidence: CapacityConfidence | null;
  notes: string | null;
}

export async function getCapacityBaseline(): Promise<CapacityBaseline> {
  const rows = await prisma.siteSetting.findMany({ where: { key: { in: Object.values(KEYS) } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  const concurrencyRaw = byKey.get(KEYS.concurrency);
  const testedAtRaw = byKey.get(KEYS.testedAt);
  const confidenceRaw = byKey.get(KEYS.confidence);

  return {
    highestTestedConcurrency: concurrencyRaw ? Number(concurrencyRaw) : null,
    testedAt: testedAtRaw ? new Date(testedAtRaw) : null,
    confidence: confidenceRaw === "LOW" || confidenceRaw === "MEDIUM" || confidenceRaw === "HIGH" ? confidenceRaw : null,
    notes: byKey.get(KEYS.notes) ?? null,
  };
}

export async function setCapacityBaseline(input: { highestTestedConcurrency: number; testedAt: Date; confidence: CapacityConfidence; notes: string }): Promise<void> {
  const values: Record<string, string> = {
    [KEYS.concurrency]: String(input.highestTestedConcurrency),
    [KEYS.testedAt]: input.testedAt.toISOString(),
    [KEYS.confidence]: input.confidence,
    [KEYS.notes]: input.notes,
  };
  for (const [key, value] of Object.entries(values)) {
    const existing = await prisma.siteSetting.findUnique({ where: { key } });
    if (existing) {
      await prisma.siteSetting.update({ where: { key }, data: { value } });
    } else {
      await prisma.siteSetting.create({ data: { key, value } });
    }
  }
}
