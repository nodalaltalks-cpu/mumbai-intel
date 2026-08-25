"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guard";
import { getPublicSession } from "@/lib/public-auth/session";
import { prisma } from "@/lib/prisma";
import { updateManyByRow } from "@/lib/actions/errors";
import { getOlderPublicNotifications, getPublicNotifications, getPublicUnreadNotificationCount, type PublicNotificationItem } from "@/lib/queries/dashboard";

/**
 * Marks every unread notification for the signed-in admin as read. Per-row
 * update() via updateManyByRow, NOT updateMany() -- the Neon HTTP adapter
 * (PrismaNeonHttp) rejects updateMany with "Transactions are not supported
 * in HTTP mode" (same constraint documented on updateManyByRow itself and
 * fixed the same way everywhere else in this codebase). All three functions
 * in this file used updateMany() until now, which meant marking a
 * notification read has never actually succeeded in any deployed
 * environment -- the write always threw, previously swallowed silently by a
 * fire-and-forget caller (making the badge look "stuck"), now caught here
 * before it can reach a caller that awaits and crashes on the throw.
 */
export async function markAdminNotificationsReadAction(): Promise<void> {
  const session = await requireSession();
  const unread = await prisma.notification.findMany({
    where: { recipientAdminUserId: session.userId, readAt: null },
    select: { id: true },
  });
  await updateManyByRow(
    unread.map((n) => n.id),
    (id) => prisma.notification.update({ where: { id }, data: { readAt: new Date() } })
  );
  revalidatePath("/admin", "layout");
}

/** Marks one admin notification as read on click. Scoped to the caller's own recipientAdminUserId so one admin can't mark another's notifications read. */
export async function markNotificationReadAction(notificationId: string): Promise<void> {
  const session = await requireSession();
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, recipientAdminUserId: session.userId, readAt: null },
    select: { id: true },
  });
  if (!notification) return;
  await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
  revalidatePath("/admin", "layout");
}

/** Public-user equivalent of markNotificationReadAction — scoped to the signed-in visitor's own recipientPublicUserId. */
export async function markPublicNotificationReadAction(notificationId: string): Promise<void> {
  const session = await getPublicSession();
  if (!session) return;
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, recipientPublicUserId: session.userId, readAt: null },
    select: { id: true },
  });
  if (!notification) return;
  await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

export interface PublicNotificationSnapshot {
  items: PublicNotificationItem[];
  /** The real unread total (not just how many of the capped `items` list happen to be unread) — see getPublicUnreadNotificationCount. */
  unreadCount: number;
}

/**
 * Lets NotificationBell (a client component, mounted once in the root
 * layout and server-rendered with whatever was true at that page load)
 * poll for new notifications without a full page refresh — Section 8's
 * "important notifications appear quickly." Plain interval polling, not a
 * websocket/SSE channel: this is a low-frequency, low-stakes UI refresh for
 * the signed-in visitor's own notifications, not session/behavior
 * surveillance, so the simplest correct mechanism is the right one. Bundles
 * the list and the unread count into one round trip rather than two
 * separate polled actions, so tightening the poll interval doesn't double
 * the read volume.
 */
export async function fetchPublicNotificationsAction(): Promise<PublicNotificationSnapshot> {
  const session = await getPublicSession();
  if (!session) return { items: [], unreadCount: 0 };
  const [items, unreadCount] = await Promise.all([getPublicNotifications(session.userId), getPublicUnreadNotificationCount(session.userId)]);
  return { items, unreadCount };
}

/** Backs the notification center's "load more" — one older page beyond whatever the bell already has, scoped to the signed-in visitor's own notifications. */
export async function fetchOlderPublicNotificationsAction(beforeIso: string): Promise<PublicNotificationItem[]> {
  const session = await getPublicSession();
  if (!session) return [];
  const before = new Date(beforeIso);
  if (Number.isNaN(before.getTime())) return [];
  return getOlderPublicNotifications(session.userId, before);
}
