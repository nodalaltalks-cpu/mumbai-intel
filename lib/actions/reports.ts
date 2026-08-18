"use server";

import { revalidatePath } from "next/cache";
import { requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { emit } from "@/lib/events";
import { friendlyPrismaError } from "./errors";
import type { ReportStatus } from "@prisma/client";

async function setStatus(reportId: string, status: ReportStatus, resolutionNote?: string): Promise<{ error?: string }> {
  const session = await requireMutateSession();
  try {
    const report = await prisma.report.update({
      where: { id: reportId },
      data: { status, reviewedByUserId: session.userId, reviewedAt: new Date(), ...(resolutionNote !== undefined ? { resolutionNote } : {}) },
    });
    await emit("ReportStatusChanged", { reportId, status, entityType: report.entityType, entityId: report.entityId, actorId: session.userId });
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
