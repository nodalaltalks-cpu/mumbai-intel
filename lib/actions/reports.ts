"use server";

import { revalidatePath } from "next/cache";
import { requireMutateSession, requireAdminSession, isAdmin } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { emit } from "@/lib/events";
import { createNotification } from "@/lib/notifications";
import { getAuditHistory } from "@/lib/admin-queries";
import { getSiteSettings } from "@/lib/site-settings";
import { logAudit } from "@/lib/audit";
import { createPendingChange } from "./pending-changes";
import { friendlyPrismaError } from "./errors";
import type { ReportStatus } from "@prisma/client";

const REPORT_NOTIFICATION_COPY: Partial<Record<ReportStatus, { title: string; body: (entityName: string, remark?: string) => string }>> = {
  UNDER_REVIEW: {
    title: "We're reviewing your report",
    body: () => "Thank you for reporting this. We are reviewing your query and aim to resolve it within 48 working hours.",
  },
  ACCEPTED: {
    title: "Your report has been accepted",
    body: (entityName) => `Your report about ${entityName} has been accepted. We are reviewing the information and will work on the correction.`,
  },
  REJECTED: {
    title: "Your report was reviewed",
    body: (entityName, remark) =>
      `Your report about ${entityName} was reviewed but could not be accepted.${remark ? `\n\nReason:\n${remark}` : ""}`,
  },
  RESOLVED: {
    title: "Your report has been resolved",
    body: (entityName) => `Your report about ${entityName} has been resolved. Thank you for helping us keep NoDalalTalks accurate.`,
  },
};

/** Appends the founder's configured review-destination links (SiteSetting-backed, admin-editable) to the resolution notification — same notification, not a separate follow-up, so there's one source of truth for "did we ask this user to review us." */
async function appendReviewRequest(body: string): Promise<string> {
  const { review_google_url: google, review_appstore_url: appstore } = await getSiteSettings(["review_google_url", "review_appstore_url"]);
  const links: string[] = [];
  if (google) links.push(`Google: ${google}`);
  if (appstore) links.push(`App Store: ${appstore}`);
  if (links.length === 0) return body;
  return `${body} Enjoying NoDalalTalks? We'd love a quick review — ${links.join(" · ")}`;
}

async function setStatus(reportId: string, status: ReportStatus, resolutionNote?: string): Promise<{ error?: string }> {
  try {
    const session = await requireMutateSession();
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
      const rawBody = copy.body(report.entityName, resolutionNote);
      const body = status === "RESOLVED" ? await appendReviewRequest(rawBody) : rawBody;
      const notificationType =
        status === "RESOLVED" ? "REPORT_RESOLVED" : status === "ACCEPTED" ? "REPORT_ACCEPTED" : status === "REJECTED" ? "REPORT_REJECTED" : "REPORT_UNDER_REVIEW";
      await createNotification({
        type: notificationType,
        title: copy.title,
        body,
        recipientPublicUserId: report.reporterUserId,
        entityType: "Report",
        entityId: report.id,
      });
    }
  } catch (error) {
    // Covers both Prisma failures AND requireMutateSession() throwing (expired/missing
    // session, insufficient role) -- previously that throw happened OUTSIDE this try block,
    // so it propagated unhandled through the Server Action and tripped the nearest error
    // boundary ("Something went wrong") instead of surfacing as a normal inline error.
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

/** The actual "mark rejected + notify the reporter with the remark" logic — called directly for an ADMIN's own rejection, and by pending-changes.ts's approval handler once a founder approves an EDITOR-queued rejection. */
export async function applyReportRejection(reportId: string, remark: string): Promise<{ error?: string }> {
  return setStatus(reportId, "REJECTED", remark);
}

/**
 * A rejection remark is required (Section 5) — the user always sees why.
 * An ADMIN's rejection applies immediately, same as every other status
 * action. An EDITOR with the reports.reject permission instead queues the
 * rejection as a PendingChange for the founder to approve (Section 7's
 * approval workflow, using this as the one wired reference integration) —
 * nothing changes for the report or notifies the reporter until approved.
 */
export async function rejectReportAction(reportId: string, remark: string): Promise<{ error?: string; success?: string }> {
  const trimmedRemark = remark?.trim();
  if (!trimmedRemark) return { error: "A rejection reason is required." };

  let session;
  try {
    session = await requireMutateSession();
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  if (isAdmin(session.role)) {
    return applyReportRejection(reportId, trimmedRemark);
  }

  if (!(await hasPermission(session, "reports.reject"))) {
    return { error: "You don't have permission to reject reports." };
  }

  try {
    const report = await prisma.report.findUnique({ where: { id: reportId }, select: { entityName: true } });
    if (!report) return { error: "Report not found — it may have already been deleted." };
    await createPendingChange({
      actorId: session.userId,
      action: "report.reject",
      entityType: "Report",
      entityId: reportId,
      after: { remark: trimmedRemark },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
  revalidatePath("/admin/reports");
  return { success: "Sent to the founder for approval — the reporter will be notified once approved." };
}

export async function resolveReportAction(reportId: string): Promise<{ error?: string }> {
  return setStatus(reportId, "RESOLVED");
}

/** Communication history for one report — reuses the existing generic AuditLog + getAuditHistory (already powering the Project edit page's History panel), not a new model. Fetched on demand per row rather than upfront for every report in the queue. */
export async function getReportHistoryAction(reportId: string) {
  await requireMutateSession();
  return getAuditHistory("Report", reportId);
}

/**
 * Permanently deletes a spam/fake report. ADMIN-only (stricter than the
 * EDITOR-permitted status actions above) since this is irreversible and the
 * UI requires an explicit confirm before calling it. Nothing else in the
 * schema holds a real foreign key to Report (Notification/EmailCampaign
 * reference it by a plain string id, not a relation), so deleting it can't
 * orphan a constrained row -- the audit entry is written first so the
 * deletion itself stays traceable in the Activity feed even though the
 * Report row it refers to is gone.
 */
export async function deleteReportAction(reportId: string): Promise<{ error?: string }> {
  try {
    const session = await requireAdminSession();
    const report = await prisma.report.findUnique({ where: { id: reportId }, select: { entityName: true, issue: true, status: true } });
    if (!report) return { error: "Report not found — it may have already been deleted." };
    await logAudit(session.userId, "report.delete", "Report", reportId, {
      before: { entityName: report.entityName, issue: report.issue, status: report.status },
    });
    await prisma.report.delete({ where: { id: reportId } });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
  revalidatePath("/admin/reports");
  return {};
}
