"use server";

import { prisma } from "@/lib/prisma";
import { requireMutateSession } from "@/lib/auth/guard";
import { ensureUniqueSlug } from "@/lib/slug";
import { friendlyPrismaError } from "./errors";
import type { InlineCreateResult } from "./builders";

/**
 * Project/Builder/Locality forms all pick amenities from one shared master
 * list (see the Amenity model's own comment) rather than free text, so a
 * unique project-specific amenity still needs to exist in that list once —
 * this is the inline "+ New Amenity" creation path, mirroring
 * createBuilderInlineAction/createLocalityInlineAction. Case-insensitive
 * find-or-create so two admins typing "Gym" and "gym" for different
 * projects don't fragment the vocabulary into two rows.
 */
export async function createAmenityInlineAction(name: string): Promise<InlineCreateResult> {
  await requireMutateSession();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required" };

  const existing = await prisma.amenity.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (existing) return { id: existing.id, name: existing.name };

  try {
    const slug = await ensureUniqueSlug(trimmed, async (candidate) => {
      const clash = await prisma.amenity.findUnique({ where: { slug: candidate } });
      return Boolean(clash);
    });
    const created = await prisma.amenity.create({
      data: { slug, name: trimmed, category: "CONVENIENCE" },
      select: { id: true, name: true },
    });
    return { id: created.id, name: created.name };
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}
