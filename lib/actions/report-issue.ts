"use server";

import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { sendReportIssueEmail } from "@/lib/email";
import { getPublicSession } from "@/lib/public-auth/session";
import { prisma } from "@/lib/prisma";
import { createNotification, notifyAllAdmins } from "@/lib/notifications";

const emptyToUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);

const reportSchema = z.object({
  entityType: z.string().trim().min(1),
  entityId: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  entityName: z.string().trim().min(1),
  entityUrl: z.string().trim().min(1),
  category: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  issue: z.string().trim().min(10, "Please describe the issue in at least 10 characters").max(2000),
  suggestedValue: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
});

export interface ReportIssueFormState {
  error?: string;
  success?: string;
}

/** "Report Incorrect Information" — works for anonymous visitors too (attaches the signed-in user's name/email automatically when present, otherwise an optional email field). */
export async function submitReportIssueAction(_prevState: ReportIssueFormState, formData: FormData): Promise<ReportIssueFormState> {
  const ip = await getClientIp();
  const limit = checkRateLimit(`report-issue:${ip}`, 5, 60 * 15);
  if (!limit.allowed) return { error: "Too many reports sent. Please try again in a few minutes." };

  const parsed = reportSchema.safeParse({
    entityType: formData.get("entityType"),
    entityId: formData.get("entityId"),
    entityName: formData.get("entityName"),
    entityUrl: formData.get("entityUrl"),
    category: formData.get("category"),
    issue: formData.get("issue"),
    suggestedValue: formData.get("suggestedValue"),
    email: formData.get("email") || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const session = await getPublicSession();
  const reporterEmail = session?.email ?? parsed.data.email ?? null;

  // Best-effort notification (kept as-is) plus real persistence, so this becomes a founder-admin
  // queue (see /admin/reports) instead of only an inbox message. Neither write blocks the other.
  await sendReportIssueEmail({
    reporterName: session?.name ?? null,
    reporterEmail,
    entityType: parsed.data.entityType,
    entityName: parsed.data.entityName,
    entityUrl: parsed.data.entityUrl,
    issue: parsed.data.issue,
  });
  try {
    const report = await prisma.report.create({
      data: {
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId ?? null,
        entityName: parsed.data.entityName,
        entityUrl: parsed.data.entityUrl,
        category: parsed.data.category ?? null,
        issue: parsed.data.issue,
        suggestedValue: parsed.data.suggestedValue ?? null,
        reporterUserId: session?.userId ?? null,
        reporterEmail,
      },
    });
    if (session?.userId) {
      await createNotification({
        type: "REPORT_RECEIVED",
        title: "We received your report",
        body: "Thanks for reporting this. We'll review it shortly.",
        recipientPublicUserId: session.userId,
        entityType: "Report",
        entityId: report.id,
      });
    }
    await notifyAllAdmins({
      type: "ADMIN_NEW_REPORT",
      title: "New report submitted",
      body: `${parsed.data.entityName} — ${parsed.data.issue.slice(0, 140)}`,
      entityType: "Report",
      entityId: report.id,
    });
  } catch (error) {
    console.error("[report-issue] failed to persist report:", error);
  }
  return { success: "Thanks, we've received your report and will review it." };
}
