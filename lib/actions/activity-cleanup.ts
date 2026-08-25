"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth/guard";
import { logAudit } from "@/lib/audit";

/**
 * Founder-only Activity Feed retention cleanup (Section 32) — deliberately
 * scoped to ONLY the AuditLog table (the Activity Feed's own backing data).
 * Never touches projects, transactions, users, ResearchEvent analytics,
 * notifications, campaigns, uploaded files, or any other table — this file
 * contains no delete/update calls against anything but `auditLog`.
 */

export type ActivityRetentionKey = "1day" | "1week" | "1month" | "6months" | "1year" | "all";

const RETENTION_LABELS: Record<ActivityRetentionKey, string> = {
  "1day": "1 day",
  "1week": "1 week",
  "1month": "1 month",
  "6months": "6 months",
  "1year": "1 year",
  all: "all time",
};

function cutoffDate(key: ActivityRetentionKey): Date | null {
  if (key === "all") return null;
  const now = Date.now();
  const days: Record<Exclude<ActivityRetentionKey, "all">, number> = {
    "1day": 1,
    "1week": 7,
    "1month": 30,
    "6months": 182,
    "1year": 365,
  };
  return new Date(now - days[key] * 24 * 60 * 60 * 1000);
}

export interface ActivityRetentionPreview {
  key: ActivityRetentionKey;
  label: string;
  count: number;
}

/** Read-only count of how many AuditLog rows a given retention choice would remove — shown before the founder confirms, never deletes anything itself. */
export async function previewActivityDeletionAction(key: ActivityRetentionKey): Promise<ActivityRetentionPreview | { error: string }> {
  try {
    await requireAdminSession();
  } catch {
    return { error: "You don't have permission to do this." };
  }

  const cutoff = cutoffDate(key);
  const count = await prisma.auditLog.count(cutoff ? { where: { at: { lt: cutoff } } } : undefined);
  return { key, label: RETENTION_LABELS[key], count };
}

export interface ActivityDeletionResult {
  error?: string;
  success?: string;
  deletedCount?: number;
}

/**
 * Deletes AuditLog rows older than the chosen cutoff (or all of them).
 * A single `deleteMany` — the `at` index (prisma/schema.prisma) keeps this
 * cheap even at larger volumes; Postgres handles a delete on an indexed
 * range in one statement without needing manual chunking at this platform's
 * current scale. The cleanup action itself is then logged as a fresh
 * AuditLog row (created *after* the delete), so the Activity Feed always
 * shows its own most recent housekeeping action even when "all" was chosen.
 */
export async function deleteActivityOlderThanAction(key: ActivityRetentionKey): Promise<ActivityDeletionResult> {
  let session;
  try {
    session = await requireAdminSession();
  } catch {
    return { error: "You don't have permission to do this." };
  }

  const cutoff = cutoffDate(key);
  const result = await prisma.auditLog.deleteMany(cutoff ? { where: { at: { lt: cutoff } } } : undefined);

  await logAudit(session.userId, "activity.cleanup", "System", "activity_feed", {
    after: { retention: RETENTION_LABELS[key], deletedCount: result.count },
  });

  revalidatePath("/admin/activity");
  return { success: `${result.count.toLocaleString("en-IN")} activity record${result.count === 1 ? "" : "s"} removed.`, deletedCount: result.count };
}
