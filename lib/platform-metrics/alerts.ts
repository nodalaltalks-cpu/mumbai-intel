import "server-only";
import { prisma } from "@/lib/prisma";
import { notifyAllAdmins } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import type { PlatformLoadState } from "@prisma/client";

/**
 * Founder-only capacity alerting (Parts 9/10/24) — reuses the existing
 * Notification model + notifyAllAdmins (ADMIN role only, same fan-out
 * lib/system-health.ts's storage warning already uses), so "Alert History"
 * is just the existing Notification list filtered to this type — no new
 * AlertHistory table.
 *
 * Cooldown: only notifies once per calendar day per load state that is
 * actively WATCH or above, mirroring checkAndNotifyStorageThreshold's
 * dedup-by-"already notified today" pattern — a sustained WARNING doesn't
 * spam a new notification every 15 minutes just because the cron runs that
 * often.
 */
const NOTIFY_STATES: PlatformLoadState[] = ["WATCH", "WARNING", "CRITICAL"];

export async function checkAndNotifyPlatformLoad(params: {
  loadState: PlatformLoadState;
  primaryBottleneck: string | null;
  bottleneckReason: string | null;
  activeNow: number;
  snapshotId: string;
}): Promise<void> {
  if (!NOTIFY_STATES.includes(params.loadState)) return;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const alreadyNotifiedToday = await prisma.notification.findFirst({
    where: { type: "ADMIN_PLATFORM_CAPACITY_WARNING", createdAt: { gte: startOfToday } },
  });
  if (alreadyNotifiedToday) return;

  const title =
    params.loadState === "CRITICAL"
      ? `Critical platform load: ${params.primaryBottleneck ?? "unknown"}`
      : `Platform capacity: ${params.loadState}`;
  const body = params.bottleneckReason
    ? `${params.bottleneckReason} Current active users: ${params.activeNow}. Review Platform Health for detail.`
    : `Platform load state is ${params.loadState}. Active users: ${params.activeNow}. Review Platform Health for detail.`;

  await notifyAllAdmins({
    type: "ADMIN_PLATFORM_CAPACITY_WARNING",
    title,
    body,
  });

  // Part 5 — also surface this in the existing Activity Feed (AuditLog),
  // not just the Notification bell, so it's visible alongside every other
  // admin-relevant event without a second UI. actorId null = system-generated,
  // the same convention AuditLog already supports (see lib/audit.ts).
  await logAudit(null, "platform-health.capacity-warning", "PlatformMetricSnapshot", params.snapshotId, { after: { loadState: params.loadState, primaryBottleneck: params.primaryBottleneck } });
}

export interface PlatformAlertHistoryEntry {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
}

export async function getPlatformAlertHistory(limit = 30): Promise<PlatformAlertHistoryEntry[]> {
  const rows = await prisma.notification.findMany({
    where: { type: "ADMIN_PLATFORM_CAPACITY_WARNING" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, title: true, body: true, createdAt: true },
  });
  return rows;
}
