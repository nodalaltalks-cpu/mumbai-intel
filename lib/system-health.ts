import "server-only";
import { prisma } from "@/lib/prisma";
import { getCloudinaryUsage } from "@/lib/cloudinary";
import { notifyAllAdmins } from "@/lib/notifications";

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
