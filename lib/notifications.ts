import "server-only";
import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@prisma/client";

/**
 * Best-effort, matching the established pattern for recordResearchEvent/
 * sendReportIssueEmail — creating a notification must never break the
 * primary action (a status change, a report submission) it's attached to.
 */
export async function createNotification(params: {
  type: NotificationType;
  title: string;
  body: string;
  recipientPublicUserId?: string | null;
  recipientAdminUserId?: string | null;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  try {
    await prisma.notification.create({ data: params });
  } catch (error) {
    console.error("[notifications] failed to create notification:", error);
  }
}

/** Fans a notification out to every active founder/admin User — e.g. "new report submitted." */
export async function notifyAllAdmins(params: {
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  try {
    const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
    await Promise.all(admins.map((admin) => prisma.notification.create({ data: { ...params, recipientAdminUserId: admin.id } })));
  } catch (error) {
    console.error("[notifications] failed to notify admins:", error);
  }
}

const UNRESOLVED_ESCALATION_HOURS = 48;

/**
 * Escalates reports still open (NEW/UNDER_REVIEW/ACCEPTED) 48+ hours after
 * submission — the ADMIN_REPORT_UNRESOLVED type already existed in the
 * schema but had no producer. Approximates "48 working hours" as 48 elapsed
 * wall-clock hours: no business-hours calendar exists in this codebase, and
 * building one is exactly the kind of infrastructure this pass is meant to
 * avoid adding for a single threshold check.
 *
 * Dedup: only escalates a report once — checks for an existing
 * ADMIN_REPORT_UNRESOLVED notification with entityId = report.id first, so
 * a daily cron run doesn't re-notify admins about the same stale report
 * every single day.
 */
export async function notifyUnresolvedReports(): Promise<{ escalated: number }> {
  const cutoff = new Date(Date.now() - UNRESOLVED_ESCALATION_HOURS * 60 * 60 * 1000);
  const staleReports = await prisma.report.findMany({
    where: { status: { in: ["NEW", "UNDER_REVIEW", "ACCEPTED"] }, createdAt: { lte: cutoff } },
    select: { id: true, entityName: true, issue: true, createdAt: true },
  });
  if (staleReports.length === 0) return { escalated: 0 };

  const alreadyEscalated = await prisma.notification.findMany({
    where: { type: "ADMIN_REPORT_UNRESOLVED", entityType: "Report", entityId: { in: staleReports.map((r) => r.id) } },
    select: { entityId: true },
  });
  const escalatedIds = new Set(alreadyEscalated.map((n) => n.entityId));
  const toEscalate = staleReports.filter((r) => !escalatedIds.has(r.id));

  for (const report of toEscalate) {
    await notifyAllAdmins({
      type: "ADMIN_REPORT_UNRESOLVED",
      title: "Report unresolved for 48+ hours",
      body: `${report.entityName} — ${report.issue.slice(0, 140)}`,
      entityType: "Report",
      entityId: report.id,
    });
  }
  return { escalated: toEscalate.length };
}
