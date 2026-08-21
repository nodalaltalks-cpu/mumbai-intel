import "server-only";
import { prisma } from "@/lib/prisma";
import { getCloudinaryUsage } from "@/lib/cloudinary";
import { notifyAllAdmins } from "@/lib/notifications";
import { getReportResolutionStats } from "@/lib/analytics/report-queries";

/**
 * NORMAL/WATCH/WARNING/CRITICAL thresholds apply only to a metric that has a
 * real, provider-reported limit (Cloudinary's credits.used_percent today).
 * Postgres/Neon has no such limit exposed without a separate Neon
 * Management API key (a new credential this codebase doesn't have) -- so the
 * database size is shown as a real number + trend, deliberately with NO
 * color-coded band, rather than inventing a limit to color-code against.
 */
export type StorageThreshold = "NORMAL" | "WATCH" | "WARNING" | "CRITICAL";

export function classifyUsagePercent(usedPercent: number): StorageThreshold {
  if (usedPercent > 90) return "CRITICAL";
  if (usedPercent > 80) return "WARNING";
  if (usedPercent > 60) return "WATCH";
  return "NORMAL";
}

/** Postgres's own size accounting — no new dependency, just the database's built-in function. */
export async function getDatabaseSizeBytes(): Promise<number | null> {
  try {
    const rows = await prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
    return rows[0] ? Number(rows[0].size) : null;
  } catch (error) {
    console.error("[system-health] failed to read database size:", error);
    return null;
  }
}

export interface StorageSnapshotResult {
  dbSizeBytes: number | null;
  cloudinaryStorageBytes: number | null;
  cloudinaryObjectCount: number | null;
  cloudinaryCreditsUsedPercent: number | null;
}

/** Captures one StorageSnapshot row — called by the daily cron, and reusable for an on-demand admin "refresh now" if ever added. */
export async function captureStorageSnapshot(): Promise<StorageSnapshotResult> {
  const [dbSizeBytes, cloudinaryUsage] = await Promise.all([getDatabaseSizeBytes(), getCloudinaryUsage()]);

  await prisma.storageSnapshot.create({
    data: {
      dbSizeBytes: dbSizeBytes !== null ? BigInt(dbSizeBytes) : null,
      cloudinaryStorageBytes: cloudinaryUsage ? BigInt(cloudinaryUsage.storageBytes) : null,
      cloudinaryObjectCount: cloudinaryUsage?.objectCount ?? null,
      cloudinaryCreditsUsedPercent: cloudinaryUsage?.creditsUsedPercent ?? null,
    },
  });

  return {
    dbSizeBytes,
    cloudinaryStorageBytes: cloudinaryUsage?.storageBytes ?? null,
    cloudinaryObjectCount: cloudinaryUsage?.objectCount ?? null,
    cloudinaryCreditsUsedPercent: cloudinaryUsage?.creditsUsedPercent ?? null,
  };
}

const NOTIFY_THRESHOLDS: StorageThreshold[] = ["WATCH", "WARNING", "CRITICAL"];

/**
 * Notifies admins once per day a threshold is actively crossed (WATCH or
 * above) — not on every cron run, so a sustained WARNING doesn't spam a new
 * notification every single day. Dedup key: an ADMIN_STORAGE_WARNING
 * notification already created today.
 */
export async function checkAndNotifyStorageThreshold(creditsUsedPercent: number | null): Promise<void> {
  if (creditsUsedPercent === null) return;
  const level = classifyUsagePercent(creditsUsedPercent);
  if (!NOTIFY_THRESHOLDS.includes(level)) return;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const alreadyNotifiedToday = await prisma.notification.findFirst({
    where: { type: "ADMIN_STORAGE_WARNING", createdAt: { gte: startOfToday } },
  });
  if (alreadyNotifiedToday) return;

  await notifyAllAdmins({
    type: "ADMIN_STORAGE_WARNING",
    title: `Storage usage: ${level}`,
    body: `Cloudinary plan credits are at ${creditsUsedPercent}% (${level}). Check System Health in Founder Admin.`,
  });
}

export interface StorageSnapshotPoint {
  capturedAt: Date;
  dbSizeBytes: number | null;
  cloudinaryStorageBytes: number | null;
  cloudinaryObjectCount: number | null;
  cloudinaryCreditsUsedPercent: number | null;
}

export async function getStorageSnapshotHistory(daysBack = 30): Promise<StorageSnapshotPoint[]> {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const rows = await prisma.storageSnapshot.findMany({
    where: { capturedAt: { gte: since } },
    orderBy: { capturedAt: "asc" },
  });
  return rows.map((r) => ({
    capturedAt: r.capturedAt,
    dbSizeBytes: r.dbSizeBytes !== null ? Number(r.dbSizeBytes) : null,
    cloudinaryStorageBytes: r.cloudinaryStorageBytes !== null ? Number(r.cloudinaryStorageBytes) : null,
    cloudinaryObjectCount: r.cloudinaryObjectCount,
    cloudinaryCreditsUsedPercent: r.cloudinaryCreditsUsedPercent !== null ? Number(r.cloudinaryCreditsUsedPercent) : null,
  }));
}

export async function getLatestStorageSnapshot(): Promise<StorageSnapshotPoint | null> {
  const row = await prisma.storageSnapshot.findFirst({ orderBy: { capturedAt: "desc" } });
  if (!row) return null;
  return {
    capturedAt: row.capturedAt,
    dbSizeBytes: row.dbSizeBytes !== null ? Number(row.dbSizeBytes) : null,
    cloudinaryStorageBytes: row.cloudinaryStorageBytes !== null ? Number(row.cloudinaryStorageBytes) : null,
    cloudinaryObjectCount: row.cloudinaryObjectCount,
    cloudinaryCreditsUsedPercent: row.cloudinaryCreditsUsedPercent !== null ? Number(row.cloudinaryCreditsUsedPercent) : null,
  };
}

/**
 * Every cron actually configured in vercel.json (kept in sync by hand --
 * there is no API this app calls to read the live cron config back, so this
 * mirrors that file rather than parsing it). "Next run" is computed directly
 * from each fixed daily UTC time; no cron-expression library needed since
 * none of these schedules are more complex than "once a day at HH:00".
 */
export interface CronJobStatus {
  path: string;
  label: string;
  scheduleLabel: string;
  nextRunAt: Date;
  /** null when this job has no in-app record of ever succeeding -- shown as "Not tracked", never guessed. */
  lastSuccessAt: Date | null;
  lastSuccessSource: string | null;
}

function nextDailyUtcRun(hourUtc: number): Date {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export async function getCronJobStatuses(): Promise<CronJobStatus[]> {
  const [latestSnapshot, latestIngestSource, latestIngestBatch] = await Promise.all([
    prisma.storageSnapshot.findFirst({ orderBy: { capturedAt: "desc" }, select: { capturedAt: true } }).catch(() => null),
    prisma.ingestSource.findFirst({ where: { lastRunAt: { not: null } }, orderBy: { lastRunAt: "desc" }, select: { lastRunAt: true } }).catch(() => null),
    prisma.ingestBatch.findFirst({ where: { status: "success" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }).catch(() => null),
  ]);

  const ingestLastSuccess = [latestIngestSource?.lastRunAt ?? null, latestIngestBatch?.startedAt ?? null].filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return [
    {
      path: "/api/cron/ingest",
      label: "Data ingestion",
      scheduleLabel: "Daily, 3:00 AM UTC",
      nextRunAt: nextDailyUtcRun(3),
      lastSuccessAt: ingestLastSuccess,
      lastSuccessSource: ingestLastSuccess ? "IngestSource / IngestBatch" : null,
    },
    {
      path: "/api/cron/report-unresolved",
      label: "Report unresolved-SLA escalation",
      scheduleLabel: "Daily, 6:00 AM UTC",
      nextRunAt: nextDailyUtcRun(6),
      // Genuinely not tracked: this cron is fire-and-forget with no DB write of its own run outcome.
      lastSuccessAt: null,
      lastSuccessSource: null,
    },
    {
      path: "/api/cron/storage-snapshot",
      label: "Storage snapshot",
      scheduleLabel: "Daily, 7:00 AM UTC",
      nextRunAt: nextDailyUtcRun(7),
      lastSuccessAt: latestSnapshot?.capturedAt ?? null,
      lastSuccessSource: latestSnapshot ? "StorageSnapshot" : null,
    },
  ];
}

export interface ReportHealthStats {
  open: number;
  accepted: number;
  rejected: number;
  resolved: number;
  /** Count of NEW/UNDER_REVIEW/ACCEPTED reports older than REPORT_SLA_HOURS. */
  unresolvedBeyondSlaCount: number;
  avgResolutionHours: number | null;
}

const REPORT_SLA_HOURS = 48;

/**
 * Status breakdown reads the Report model directly; avgResolutionHours
 * reuses lib/analytics/report-queries.ts's getReportResolutionStats() (the
 * one place that calculation lives -- not duplicated here). "Unresolved
 * beyond SLA" mirrors the same 48h threshold lib/notifications.ts's
 * escalation already uses.
 */
export async function getReportHealthStats(): Promise<ReportHealthStats> {
  const slaSince = new Date(Date.now() - REPORT_SLA_HOURS * 60 * 60 * 1000);
  const [open, accepted, rejected, resolved, unresolvedBeyondSla, resolutionStats] = await Promise.all([
    prisma.report.count({ where: { status: "NEW" } }),
    prisma.report.count({ where: { status: "ACCEPTED" } }),
    prisma.report.count({ where: { status: "REJECTED" } }),
    prisma.report.count({ where: { status: "RESOLVED" } }),
    prisma.report.count({ where: { status: { in: ["NEW", "UNDER_REVIEW", "ACCEPTED"] }, createdAt: { lt: slaSince } } }),
    getReportResolutionStats(),
  ]);
  return { open, accepted, rejected, resolved, unresolvedBeyondSlaCount: unresolvedBeyondSla, avgResolutionHours: resolutionStats.avgResolutionHours };
}

export interface NotificationHealthStats {
  unreadAdminNotifications: number;
  unresolvedReportNotifications: number;
}

export async function getNotificationHealthStats(): Promise<NotificationHealthStats> {
  const [unreadAdminNotifications, unresolvedReportNotifications] = await Promise.all([
    prisma.notification.count({ where: { recipientAdminUserId: { not: null }, readAt: null } }),
    prisma.notification.count({ where: { type: "ADMIN_NEW_REPORT", readAt: null } }),
  ]);
  return { unreadAdminNotifications, unresolvedReportNotifications };
}

export interface EmailHealthStats {
  acceptedAllTime: number;
  failedAllTime: number;
  acceptedLast24h: number;
  failedLast24h: number;
}

/** Per-recipient outcomes from the real Resend response (see EmailRecipientStatus's doc comment) -- ACCEPTED means the provider took the send, never proof of delivery. */
export async function getEmailHealthStats(): Promise<EmailHealthStats> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [acceptedAllTime, failedAllTime, acceptedLast24h, failedLast24h] = await Promise.all([
    prisma.emailCampaignRecipient.count({ where: { status: "ACCEPTED" } }),
    prisma.emailCampaignRecipient.count({ where: { status: "FAILED" } }),
    prisma.emailCampaignRecipient.count({ where: { status: "ACCEPTED", sentAt: { gte: since24h } } }),
    prisma.emailCampaignRecipient.count({ where: { status: "FAILED", campaign: { createdAt: { gte: since24h } } } }),
  ]);
  return { acceptedAllTime, failedAllTime, acceptedLast24h, failedLast24h };
}
