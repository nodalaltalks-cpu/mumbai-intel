"use server";

import { revalidatePath } from "next/cache";
import { requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { emit } from "@/lib/events";
import { createNotification } from "@/lib/notifications";
import { getAuditHistory } from "@/lib/admin-queries";
import { friendlyPrismaError } from "./errors";
import type { ReportStatus } from "@prisma/client";

const REPORT_NOTIFICATION_COPY: Partial<Record<ReportStatus, { title: string; body: string }>> = {
  UNDER_REVIEW: {
    title: "We're reviewing your report",
    body: "Thank you for reporting this. We are reviewing your query and aim to resolve it within 48 working hours.",
  },
  ACCEPTED: {
    title: "We're reviewing your report",
    body: "Thank you for reporting this. We are reviewing your query and aim to resolve it within 48 working hours.",
  },
  RESOLVED: {
    title: "Your report has been resolved",
    body: "Your reported issue has been resolved. Please review the updated information.",
  },
};

async function setStatus(reportId: string, status: ReportStatus, resolutionNote?: string): Promise<{ error?: string }> {
  const session = await requireMutateSession();
  try {
    const existing = await prisma.report.findUnique({ where: { id: reportId }, select: { status: true } });
    const report = await prisma.report.update({
      where: { id: reportId },
      data: { status, reviewedByUserId: session.userId, reviewedAt: new Date(), ...(resolutionNote !== undefined ? { resolutionNote } : {}) },
    });
    await emit("ReportStatusChanged", {
      reportId,
      status,
      previousStatus: existing?.status ?? "NEW",
      note: resolutionNote,
      entityType: report.entityType,
      entityId: report.entityId,
      actorId: session.userId,
    });

    const copy = REPORT_NOTIFICATION_COPY[status];
    if (copy && report.reporterUserId) {
      await createNotification({
        type: status === "RESOLVED" ? "REPORT_RESOLVED" : "REPORT_UNDER_REVIEW",
        title: copy.title,
        body: copy.body,
        recipientPublicUserId: report.reporterUserId,
        entityType: "Report",
        entityId: report.id,
      });
    }
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
  revalidatePath("/admin/reports");
  return {};
}

export async function markUnderReviewAction(reportId: string): Promise<{ error?: string }> {
  return setStatus(reportId, "UNDER_REVIEW");
}

export async function acceptReportAction(reportId: string): Promise<{ error?: string }> {
  return setStatus(reportId, "ACCEPTED");
}

export async function rejectReportAction(reportId: string): Promise<{ error?: string }> {
  return setStatus(reportId, "REJECTED");
}

export async function resolveReportAction(reportId: string): Promise<{ error?: string }> {
  return setStatus(reportId, "RESOLVED");
}

/** Communication history for one report — reuses the existing generic AuditLog + getAuditHistory (already powering the Project edit page's History panel), not a new model. Fetched on demand per row rather than upfront for every report in the queue. */
export async function getReportHistoryAction(reportId: string) {
  await requireMutateSession();
  return getAuditHistory("Report", reportId);
}
