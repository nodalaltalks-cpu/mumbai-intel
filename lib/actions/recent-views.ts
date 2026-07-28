"use server";

import { prisma } from "@/lib/prisma";
import { getPublicSession } from "@/lib/public-auth/session";

export type RecentViewEntityType = "Project" | "Builder" | "Locality" | "Transaction" | "MarketReport";

/**
 * Records that a logged-in user opened an entity — "Continue Research".
 * Manual find-then-update-or-create (never a raw create) so viewing the
 * same entity twice is a timestamp bump, never a second row: the compound
 * unique constraint on (publicUserId, entityType, entityId) is what a
 * naive `create()` would violate, which is exactly the point — this
 * function is the only place allowed to write to this table so that
 * invariant can never be bypassed. No-ops silently for anonymous visitors
 * (this is a value-add for logged-in users, not something that should ever
 * block or error a page render for someone who isn't signed in).
 */
export async function recordRecentViewAction(entityType: RecentViewEntityType, entityId: string): Promise<void> {
  const session = await getPublicSession();
  if (!session) return;

  try {
    const existing = await prisma.recentView.findUnique({
      where: { publicUserId_entityType_entityId: { publicUserId: session.userId, entityType, entityId } },
    });
    if (existing) {
      await prisma.recentView.update({ where: { id: existing.id }, data: { viewedAt: new Date() } });
    } else {
      await prisma.recentView.create({ data: { publicUserId: session.userId, entityType, entityId } });
    }
  } catch (error) {
    // Best-effort — a failure here must never break the page the user is trying to view.
    console.error("[recent-views] failed to record view", entityType, entityId, error);
  }
}

export async function removeRecentViewAction(id: string): Promise<{ error?: string }> {
  const session = await getPublicSession();
  if (!session) return { error: "Sign in to manage your history." };
  await prisma.recentView.deleteMany({ where: { id, publicUserId: session.userId } });
  return {};
}

export async function clearRecentViewsAction(): Promise<{ error?: string }> {
  const session = await getPublicSession();
  if (!session) return { error: "Sign in to manage your history." };
  await prisma.recentView.deleteMany({ where: { publicUserId: session.userId } });
  return {};
}
