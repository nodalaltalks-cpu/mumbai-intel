"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPublicSession } from "@/lib/public-auth/session";

export type WishlistEntityType = "Builder" | "Locality";

export interface ToggleWishlistResult {
  saved: boolean;
  error?: string;
}

/** Bookmarks/unbookmarks a Builder or Locality for the signed-in public user — the Wishlist counterpart to toggleSavedProjectAction (Projects stay on the existing SavedProject table). No-ops (returns an error) if not signed in. */
export async function toggleWishlistAction(entityType: WishlistEntityType, entityId: string): Promise<ToggleWishlistResult> {
  const session = await getPublicSession();
  if (!session) return { saved: false, error: "Sign in to save items." };

  const existing = await prisma.wishlist.findUnique({
    where: { publicUserId_entityType_entityId: { publicUserId: session.userId, entityType, entityId } },
  });

  if (existing) {
    await prisma.wishlist.delete({ where: { id: existing.id } });
    revalidatePath("/account");
    return { saved: false };
  }

  await prisma.wishlist.create({ data: { publicUserId: session.userId, entityType, entityId } });
  revalidatePath("/account");
  return { saved: true };
}

export async function isWishlisted(entityType: WishlistEntityType, entityId: string): Promise<boolean> {
  const session = await getPublicSession();
  if (!session) return false;
  const existing = await prisma.wishlist.findUnique({
    where: { publicUserId_entityType_entityId: { publicUserId: session.userId, entityType, entityId } },
  });
  return existing !== null;
}

export async function removeWishlistItemAction(id: string): Promise<{ error?: string }> {
  const session = await getPublicSession();
  if (!session) return { error: "Sign in to manage your wishlist." };
  await prisma.wishlist.deleteMany({ where: { id, publicUserId: session.userId } });
  revalidatePath("/account");
  return {};
}
