import "server-only";
import { prisma } from "@/lib/prisma";
import { CATEGORY_LABEL, CONFIGURATION_FILTER_OPTIONS, type PropertyCategory } from "@/lib/project-meta";

/**
 * Founder-facing "what are researchers actually looking for" — reads ONLY
 * real UserPreferences rows, aggregated in JS (the Neon HTTP adapter has no
 * groupBy over array columns like preferredConfigurations/preferredReadiness/
 * purposes/preferredLocalityIds/localityFreeText, so those need the rows
 * fetched once and counted here, same "grouped in JS" pattern already used
 * throughout lib/analytics/*.ts for array/JSON fields). Never invents a
 * number: every count below traces to an actual UserPreferences row.
 */

async function safeQuery<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[user-demand-queries] ${label} failed:`, error);
    return fallback;
  }
}

const BUDGET_BUCKETS = [
  { key: "under_50l", label: "Under ₹50 L", maxRupees: 50_00_000 },
  { key: "50l_1cr", label: "₹50 L – ₹1 Cr", maxRupees: 1_00_00_000 },
  { key: "1cr_2cr", label: "₹1 Cr – ₹2 Cr", maxRupees: 2_00_00_000 },
  { key: "2cr_5cr", label: "₹2 Cr – ₹5 Cr", maxRupees: 5_00_00_000 },
  { key: "above_5cr", label: "Above ₹5 Cr", maxRupees: Infinity },
] as const;

export interface UserDemandSummary {
  totalUsers: number;
  usersWithAnyPreference: number;
  byLocality: { label: string; count: number; source: "structured" | "free_text" }[];
  byBudget: { key: string; label: string; count: number }[];
  byConfiguration: { label: string; count: number }[];
  byPropertyType: { label: string; count: number }[];
  byReadiness: { label: string; count: number }[];
  selfUseCount: number;
  investmentCount: number;
  bothCount: number;
  lastUpdated: Date;
}

export async function getUserDemandSummary(): Promise<UserDemandSummary> {
  return safeQuery(
    "getUserDemandSummary",
    {
      totalUsers: 0,
      usersWithAnyPreference: 0,
      byLocality: [],
      byBudget: [],
      byConfiguration: [],
      byPropertyType: [],
      byReadiness: [],
      selfUseCount: 0,
      investmentCount: 0,
      bothCount: 0,
      lastUpdated: new Date(),
    },
    async () => {
      const [totalUsers, rows] = await Promise.all([
        prisma.publicUser.count(),
        prisma.userPreferences.findMany({
          select: {
            preferredBudgetMinRupees: true,
            preferredBudgetMaxRupees: true,
            preferredLocalityIds: true,
            localityFreeText: true,
            preferredCategory: true,
            preferredConfigurations: true,
            preferredReadiness: true,
            purposes: true,
          },
        }),
      ]);

      const usersWithAnyPreference = rows.filter(
        (r) =>
          r.preferredBudgetMinRupees !== null ||
          r.preferredBudgetMaxRupees !== null ||
          r.preferredLocalityIds.length > 0 ||
          r.localityFreeText.length > 0 ||
          r.preferredCategory !== null ||
          r.preferredConfigurations.length > 0 ||
          r.preferredReadiness.length > 0 ||
          r.purposes.length > 0
      ).length;

      // Locality: structured picks resolved to real names, plus free-text
      // entries normalized (trim+lowercase) so "Chembur"/"chembur" collapse,
      // same normalization already used for Market Snapshot's locality count.
      const structuredCounts = new Map<string, number>();
      for (const r of rows) for (const id of r.preferredLocalityIds) structuredCounts.set(id, (structuredCounts.get(id) ?? 0) + 1);
      const localityIds = Array.from(structuredCounts.keys());
      const localityNames = localityIds.length
        ? await prisma.locality.findMany({ where: { id: { in: localityIds } }, select: { id: true, name: true } })
        : [];
      const nameById = new Map(localityNames.map((l) => [l.id, l.name]));

      const freeTextCounts = new Map<string, number>();
      for (const r of rows) for (const t of r.localityFreeText) {
        const key = t.trim().toLowerCase();
        if (key) freeTextCounts.set(key, (freeTextCounts.get(key) ?? 0) + 1);
      }

      const byLocality = [
        ...Array.from(structuredCounts.entries())
          .filter(([id]) => nameById.has(id))
          .map(([id, count]) => ({ label: nameById.get(id) as string, count, source: "structured" as const })),
        ...Array.from(freeTextCounts.entries()).map(([label, count]) => ({ label, count, source: "free_text" as const })),
      ].sort((a, b) => b.count - a.count);

      // Budget: bucketed by preferredBudgetMaxRupees when set, else min --
      // a user who only gave a floor still signals a real budget tier.
      const budgetCounts = new Map<string, number>(BUDGET_BUCKETS.map((b) => [b.key, 0]));
      for (const r of rows) {
        const anchor = r.preferredBudgetMaxRupees ?? r.preferredBudgetMinRupees;
        if (anchor === null || anchor === undefined) continue;
        const bucket = BUDGET_BUCKETS.find((b) => anchor <= b.maxRupees);
        if (bucket) budgetCounts.set(bucket.key, (budgetCounts.get(bucket.key) ?? 0) + 1);
      }
      const byBudget = BUDGET_BUCKETS.map((b) => ({ key: b.key, label: b.label, count: budgetCounts.get(b.key) ?? 0 }));

      // Configuration (BHK): multi-select, one user can count toward more than one bucket.
      const configCounts = new Map<string, number>();
      for (const r of rows) for (const c of r.preferredConfigurations) configCounts.set(c, (configCounts.get(c) ?? 0) + 1);
      const byConfiguration = CONFIGURATION_FILTER_OPTIONS.map((c) => ({ label: c.label, count: configCounts.get(c.value) ?? 0 })).filter(
        (c) => c.count > 0
      );

      // Property type: single-select field, real Prisma groupBy is fine here.
      const categoryGroups = await prisma.userPreferences.groupBy({
        by: ["preferredCategory"],
        where: { preferredCategory: { not: null } },
        _count: { _all: true },
      });
      const byPropertyType = categoryGroups
        .map((g) => ({ label: CATEGORY_LABEL[g.preferredCategory as PropertyCategory], count: g._count._all }))
        .sort((a, b) => b.count - a.count);

      // Readiness: multi-select.
      const readinessLabel: Record<string, string> = { READY_TO_MOVE: "Ready to Move", UNDER_CONSTRUCTION: "Under Construction", NEW_LAUNCH: "New Launch" };
      const readinessCounts = new Map<string, number>();
      for (const r of rows) for (const s of r.preferredReadiness) readinessCounts.set(s, (readinessCounts.get(s) ?? 0) + 1);
      const byReadiness = Array.from(readinessCounts.entries())
        .map(([key, count]) => ({ label: readinessLabel[key] ?? key, count }))
        .sort((a, b) => b.count - a.count);

      // Purpose: self-use / investment / both.
      let selfUseCount = 0;
      let investmentCount = 0;
      let bothCount = 0;
      for (const r of rows) {
        const hasSelf = r.purposes.includes("SELF_USE");
        const hasInvestment = r.purposes.includes("INVESTMENT");
        if (hasSelf && hasInvestment) bothCount += 1;
        else if (hasSelf) selfUseCount += 1;
        else if (hasInvestment) investmentCount += 1;
      }

      return {
        totalUsers,
        usersWithAnyPreference,
        byLocality,
        byBudget,
        byConfiguration,
        byPropertyType,
        byReadiness,
        selfUseCount,
        investmentCount,
        bothCount,
        lastUpdated: new Date(),
      };
    }
  );
}
