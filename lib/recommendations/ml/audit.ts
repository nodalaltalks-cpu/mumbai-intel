import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Part 2 — data audit. Every count here reads an EXISTING table (no new
 * analytics infrastructure); this is purely a summarization layer so the
 * admin dashboard and the training-sufficiency check both see the same
 * honest numbers.
 */
export interface RecommendationDataAudit {
  userProfile: { usersWithPreferences: number; totalRegisteredUsers: number };
  behavioral: {
    searches: number;
    projectViews: number;
    savedProjects: number;
    compares: number;
    contactEnquiries: number;
    returningVisitorSessions: number;
  };
  catalog: { totalProjects: number; publishedProjects: number; distinctLocalities: number; distinctBuilders: number };
  recommendation: { impressions: number; clicks: number; distinctProjectsRecommended: number; distinctSubjectsServed: number };
}

/**
 * No dedicated "returning visit" event exists in the existing taxonomy —
 * this is a real query, not a new event: a registered user counts as
 * "returning" if their ResearchEvent rows span more than one distinct
 * calendar day. Raw SQL (not groupBy) because Prisma's groupBy can't
 * express "distinct days per user" in one round trip without pulling
 * every row client-side, which wouldn't stay bounded as the event log
 * grows (Part 17 of the Platform Capacity spec: bounded queries).
 */
async function countReturningRegisteredVisitors(): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS count FROM (
      SELECT "publicUserId"
      FROM "ResearchEvent"
      WHERE "publicUserId" IS NOT NULL
      GROUP BY "publicUserId"
      HAVING COUNT(DISTINCT DATE_TRUNC('day', "createdAt")) > 1
    ) AS returning_users
  `;
  return rows[0] ? Number(rows[0].count) : 0;
}

export async function getRecommendationDataAudit(): Promise<RecommendationDataAudit> {
  const [
    usersWithPreferences,
    totalRegisteredUsers,
    searches,
    projectViews,
    savedProjects,
    compares,
    contactEnquiries,
    returningVisitorSessions,
    totalProjects,
    publishedProjectsAgg,
    impressions,
    clicks,
    impressionEntityGroups,
    impressionSubjectGroups,
  ] = await Promise.all([
    prisma.userPreferences.count(),
    prisma.publicUser.count(),
    prisma.researchEvent.count({ where: { eventType: { in: ["SEARCH_PERFORMED", "TRANSACTION_SEARCHED"] } } }),
    prisma.researchEvent.count({ where: { eventType: "PROJECT_VIEWED" } }),
    prisma.savedProject.count(),
    prisma.researchEvent.count({ where: { eventType: "COMPARE_USED" } }),
    prisma.researchEvent.count({ where: { eventType: "CONTACT_ENQUIRY_SUBMITTED" } }),
    countReturningRegisteredVisitors(),
    prisma.project.count({ where: { deletedAt: null } }),
    prisma.project.groupBy({
      by: ["localityId", "builderId"],
      where: { isPublished: true, isArchived: false, deletedAt: null },
    }),
    prisma.researchEvent.count({ where: { eventType: "RECOMMENDATION_IMPRESSION" } }),
    prisma.researchEvent.count({ where: { eventType: "RECOMMENDATION_CLICKED" } }),
    prisma.researchEvent.groupBy({ by: ["entityId"], where: { eventType: "RECOMMENDATION_IMPRESSION" } }),
    prisma.researchEvent.groupBy({ by: ["publicUserId", "sessionId"], where: { eventType: "RECOMMENDATION_IMPRESSION" } }),
  ]);

  const publishedProjects = publishedProjectsAgg.length;
  const distinctLocalities = new Set(publishedProjectsAgg.map((p) => p.localityId)).size;
  const distinctBuilders = new Set(publishedProjectsAgg.map((p) => p.builderId).filter((id): id is string => id !== null)).size;

  return {
    userProfile: { usersWithPreferences, totalRegisteredUsers },
    behavioral: {
      searches,
      projectViews,
      savedProjects,
      compares,
      contactEnquiries,
      returningVisitorSessions,
    },
    catalog: { totalProjects, publishedProjects, distinctLocalities, distinctBuilders },
    recommendation: {
      impressions,
      clicks,
      distinctProjectsRecommended: impressionEntityGroups.length,
      distinctSubjectsServed: impressionSubjectGroups.length,
    },
  };
}
