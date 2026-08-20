import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Referral/Sharing Intelligence — reads ONLY the existing ResearchEvent log
 * and PublicUser.referredByUserId/referralSource, exactly as the rest of
 * this app's analytics already do (see lib/admin-queries.ts's safeQuery
 * convention, mirrored here). No second analytics system, no new event
 * store: REFERRAL_SHARE_INITIATED/REFERRAL_LINK_CLICKED/WHATSAPP_SHARE_CLICKED
 * rows plus the PublicUser referral columns are the entire data source.
 */

async function safeQuery<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[referral-queries] ${label} failed:`, error);
    return fallback;
  }
}

export interface ReferralOverview {
  totalShares: number;
  whatsappShares: number;
  copyLinkShares: number;
  nativeShares: number;
  projectWhatsappShares: number;
  referralLinkClicks: number;
  newUsersFromReferrals: number;
  totalNewUsers: number;
  /** newUsersFromReferrals / referralLinkClicks, i.e. what fraction of clicks became a registration. */
  registrationConversionRatePercent: number | null;
}

export async function getReferralOverview(since?: Date): Promise<ReferralOverview> {
  return safeQuery(
    "getReferralOverview",
    {
      totalShares: 0,
      whatsappShares: 0,
      copyLinkShares: 0,
      nativeShares: 0,
      projectWhatsappShares: 0,
      referralLinkClicks: 0,
      newUsersFromReferrals: 0,
      totalNewUsers: 0,
      registrationConversionRatePercent: null,
    },
    async () => {
      const createdAtFilter = since ? { createdAt: { gte: since } } : {};
      const [shareEvents, projectShareCount, referralLinkClicks, newUsersFromReferrals, totalNewUsers] = await Promise.all([
        prisma.researchEvent.findMany({
          where: { eventType: "REFERRAL_SHARE_INITIATED", ...createdAtFilter },
          select: { metadata: true },
        }),
        prisma.researchEvent.count({ where: { eventType: "WHATSAPP_SHARE_CLICKED", ...createdAtFilter } }),
        prisma.researchEvent.count({ where: { eventType: "REFERRAL_LINK_CLICKED", ...createdAtFilter } }),
        prisma.publicUser.count({ where: { referredByUserId: { not: null }, ...(since ? { createdAt: { gte: since } } : {}) } }),
        prisma.publicUser.count({ where: since ? { createdAt: { gte: since } } : {} }),
      ]);

      let whatsappShares = 0;
      let copyLinkShares = 0;
      let nativeShares = 0;
      for (const row of shareEvents) {
        const channel = (row.metadata as { channel?: string } | null)?.channel;
        if (channel === "whatsapp") whatsappShares += 1;
        else if (channel === "copy_link") copyLinkShares += 1;
        else if (channel === "native_share") nativeShares += 1;
      }

      return {
        totalShares: shareEvents.length,
        whatsappShares,
        copyLinkShares,
        nativeShares,
        projectWhatsappShares: projectShareCount,
        referralLinkClicks,
        newUsersFromReferrals,
        totalNewUsers,
        registrationConversionRatePercent: referralLinkClicks > 0 ? Math.round((newUsersFromReferrals / referralLinkClicks) * 100) : null,
      };
    }
  );
}

export interface TopReferrer {
  userId: string;
  name: string | null;
  email: string;
  referralCount: number;
}

/** Which users generate the most referrals — counts PublicUser rows whose referredByUserId points at each referrer. */
export async function getTopReferrers(limit = 10): Promise<TopReferrer[]> {
  return safeQuery("getTopReferrers", [], async () => {
    const grouped = await prisma.publicUser.groupBy({
      by: ["referredByUserId"],
      where: { referredByUserId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { referredByUserId: "desc" } },
      take: limit,
    });
    if (grouped.length === 0) return [];

    const referrers = await prisma.publicUser.findMany({
      where: { id: { in: grouped.map((g) => g.referredByUserId as string) } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(referrers.map((r) => [r.id, r]));

    return grouped
      .filter((g) => byId.has(g.referredByUserId as string))
      .map((g) => {
        const referrer = byId.get(g.referredByUserId as string) as { id: string; name: string | null; email: string };
        return { userId: referrer.id, name: referrer.name, email: referrer.email, referralCount: g._count._all };
      });
  });
}

export interface MostSharedProject {
  projectId: string;
  projectName: string | null;
  shareCount: number;
}

/** Which projects are shared the most (WhatsApp share only — the one share action tied to a specific project). */
export async function getMostSharedProjects(limit = 10): Promise<MostSharedProject[]> {
  return safeQuery("getMostSharedProjects", [], async () => {
    const grouped = await prisma.researchEvent.groupBy({
      by: ["entityId"],
      where: { eventType: "WHATSAPP_SHARE_CLICKED", entityType: "Project", entityId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { entityId: "desc" } },
      take: limit,
    });
    if (grouped.length === 0) return [];

    const projects = await prisma.project.findMany({
      where: { id: { in: grouped.map((g) => g.entityId as string) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(projects.map((p) => [p.id, p.name]));

    return grouped.map((g) => ({
      projectId: g.entityId as string,
      projectName: nameById.get(g.entityId as string) ?? null,
      shareCount: g._count._all,
    }));
  });
}

export interface ReferralChannelBreakdown {
  channel: string;
  count: number;
}

/** Which referral channel (from mi_ref_code's stored channel tag) drives the most attributed registrations. */
export async function getReferralChannelBreakdown(): Promise<ReferralChannelBreakdown[]> {
  return safeQuery("getReferralChannelBreakdown", [], async () => {
    const grouped = await prisma.publicUser.groupBy({
      by: ["referralSource"],
      where: { referredByUserId: { not: null } },
      _count: { _all: true },
    });
    return grouped
      .map((g) => ({ channel: g.referralSource ?? "unknown", count: g._count._all }))
      .sort((a, b) => b.count - a.count);
  });
}

export interface ReferralEngagementStats {
  referredUsers: number;
  /** Referred users with at least one ResearchEvent of their own after signup — the "did anything at all" bar. */
  referredUsersWithActivity: number;
  /** Referred users who viewed a project, downloaded a brochure, or viewed the transactions list at least once. */
  referredUsersMeaningfullyEngaged: number;
  engagementRatePercent: number | null;
}

/**
 * Referral → engagement funnel. Deliberately reuses events that already
 * exist for every user (ResearchEvent rows keyed by publicUserId,
 * BrochureDownloadEvent) rather than adding new tracking just for referred
 * users — see the module doc comment.
 */
export async function getReferralEngagementStats(): Promise<ReferralEngagementStats> {
  return safeQuery(
    "getReferralEngagementStats",
    { referredUsers: 0, referredUsersWithActivity: 0, referredUsersMeaningfullyEngaged: 0, engagementRatePercent: null },
    async () => {
      const referredUserIds = (
        await prisma.publicUser.findMany({ where: { referredByUserId: { not: null } }, select: { id: true } })
      ).map((u) => u.id);
      if (referredUserIds.length === 0) {
        return { referredUsers: 0, referredUsersWithActivity: 0, referredUsersMeaningfullyEngaged: 0, engagementRatePercent: null };
      }

      const [anyActivityIds, meaningfulActivityIds] = await Promise.all([
        prisma.researchEvent.findMany({
          where: { publicUserId: { in: referredUserIds } },
          select: { publicUserId: true },
          distinct: ["publicUserId"],
        }),
        prisma.researchEvent.findMany({
          where: {
            publicUserId: { in: referredUserIds },
            eventType: { in: ["PROJECT_VIEWED", "TRANSACTION_LIST_VIEWED", "TRANSACTION_VIEWED"] },
          },
          select: { publicUserId: true },
          distinct: ["publicUserId"],
        }),
      ]);

      const referredUsers = referredUserIds.length;
      const referredUsersWithActivity = anyActivityIds.length;
      const referredUsersMeaningfullyEngaged = meaningfulActivityIds.length;

      return {
        referredUsers,
        referredUsersWithActivity,
        referredUsersMeaningfullyEngaged,
        engagementRatePercent: referredUsers > 0 ? Math.round((referredUsersMeaningfullyEngaged / referredUsers) * 100) : null,
      };
    }
  );
}
