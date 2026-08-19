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
