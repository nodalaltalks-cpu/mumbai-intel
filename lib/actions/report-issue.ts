"use server";

import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { sendReportIssueEmail } from "@/lib/email";
import { getPublicSession } from "@/lib/public-auth/session";

const reportSchema = z.object({
  entityType: z.string().trim().min(1),
  entityName: z.string().trim().min(1),
  entityUrl: z.string().trim().min(1),
  issue: z.string().trim().min(10, "Please describe the issue in at least 10 characters").max(2000),
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
    entityName: formData.get("entityName"),
    entityUrl: formData.get("entityUrl"),
    issue: formData.get("issue"),
    email: formData.get("email") || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const session = await getPublicSession();
  await sendReportIssueEmail({
    reporterName: session?.name ?? null,
    reporterEmail: session?.email ?? parsed.data.email ?? null,
    entityType: parsed.data.entityType,
    entityName: parsed.data.entityName,
    entityUrl: parsed.data.entityUrl,
    issue: parsed.data.issue,
  });
  return { success: "Thanks — we've received your report and will review it." };
}
