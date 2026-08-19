"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

/** Marks every unread notification for the signed-in admin as read — mirrors the Activity panel's existing "mark seen on open" convention, just backed by a real column instead of localStorage. */
export async function markAdminNotificationsReadAction(): Promise<void> {
  const session = await requireSession();
  await prisma.notification.updateMany({
    where: { recipientAdminUserId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/admin", "layout");
}
