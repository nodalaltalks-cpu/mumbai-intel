"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guard";
import { getPublicSession } from "@/lib/public-auth/session";
import { prisma } from "@/lib/prisma";

/** Marks every unread notification for the signed-in admin as read — kept for a "mark all read" affordance, but per-item reads now happen via markNotificationReadAction so unread/read can visibly coexist in the list instead of the whole dropdown flipping to read the instant it's opened. */
export async function markAdminNotificationsReadAction(): Promise<void> {
  const session = await requireSession();
  await prisma.notification.updateMany({
    where: { recipientAdminUserId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/admin", "layout");
}

/** Marks one admin notification as read on click. Scoped to the caller's own recipientAdminUserId so one admin can't mark another's notifications read. */
export async function markNotificationReadAction(notificationId: string): Promise<void> {
  const session = await requireSession();
  await prisma.notification.updateMany({
    where: { id: notificationId, recipientAdminUserId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/admin", "layout");
}

/** Public-user equivalent of markNotificationReadAction — scoped to the signed-in visitor's own recipientPublicUserId. */
export async function markPublicNotificationReadAction(notificationId: string): Promise<void> {
  const session = await getPublicSession();
  if (!session) return;
  await prisma.notification.updateMany({
    where: { id: notificationId, recipientPublicUserId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}
