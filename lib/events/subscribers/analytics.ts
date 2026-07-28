import "server-only";
import { prisma } from "@/lib/prisma";
import { ProjectAnalyticsService } from "@/lib/analytics/projectAnalytics";
import { on } from "../bus";

/**
 * Event-driven analytics recalculation — whenever a Project's own data (or,
 * once wired, its transaction history) changes, its stored `ProjectMetric`
 * rows are recomputed automatically, using the exact same formulas
 * `AnalyticsService` already uses everywhere else (no duplicated logic —
 * see docs/governance-standards.md §1).
 *
 * Recompute is a manual find-then-create-or-update, not Prisma's `upsert()`
 * — the Neon HTTP adapter this app runs on doesn't support the interactive
 * transaction `upsert()` needs internally (see lib/prisma.ts).
 */

const METHODOLOGY_VERSION = "events-v1";

async function upsertProjectMetric(projectId: string, key: string, valueNumeric: number | null, unit: string): Promise<void> {
  if (valueNumeric === null) return;
  const existing = await prisma.projectMetric.findUnique({ where: { projectId_key: { projectId, key } } });
  if (existing) {
    await prisma.projectMetric.update({
      where: { id: existing.id },
      data: { valueNumeric, unit, asOf: new Date(), methodologyVersion: METHODOLOGY_VERSION },
    });
  } else {
    await prisma.projectMetric.create({
      data: {
        projectId,
        key,
        valueNumeric,
        unit,
        dataSource: "AI_GENERATED",
        confidence: "MEDIUM",
        methodologyVersion: METHODOLOGY_VERSION,
      },
    });
  }
}

async function recomputeProjectMetrics(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      configurations: { select: { bedrooms: true, carpetSqft: true, priceMinPaise: true } },
      locality: { select: { investmentScore: true } },
      builder: { select: { scoreSnapshots: { orderBy: { asOf: "desc" }, take: 1, select: { overallScore: true } } } },
      _count: { select: { transactions: true } },
    },
  });
  if (!project) return;

  const pricePerSqft = ProjectAnalyticsService.calculatePricePerSqft(project.configurations);
  const investmentScore = ProjectAnalyticsService.calculateInvestmentScore(
    project.locality.investmentScore !== null ? Number(project.locality.investmentScore) : null,
    project.builder?.scoreSnapshots[0]?.overallScore !== undefined ? Number(project.builder.scoreSnapshots[0].overallScore) : null,
    project._count.transactions
  );

  await upsertProjectMetric(projectId, "avg_ppsf_paise", pricePerSqft, "paise");
  await upsertProjectMetric(projectId, "investment_score", investmentScore, "score_0_10");
}

on("ProjectUpdated", async (p) => {
  await recomputeProjectMetrics(p.projectId);
});

on("ProjectPublished", async (p) => {
  await recomputeProjectMetrics(p.projectId);
});

on("ReviewApproved", async (p) => {
  if (p.entityType === "Project" && p.entityId) await recomputeProjectMetrics(p.entityId);
});

on("TransactionImported", async (p) => {
  const transaction = await prisma.transaction.findUnique({ where: { id: p.transactionId }, select: { projectId: true } });
  if (transaction?.projectId) await recomputeProjectMetrics(transaction.projectId);
});
