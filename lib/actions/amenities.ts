"use server";

import { prisma } from "@/lib/prisma";
import { requireMutateSession } from "@/lib/auth/guard";
import { ensureUniqueSlug } from "@/lib/slug";
import { friendlyPrismaError } from "./errors";

export interface AmenityInlineCreateResult {
  id?: string;
  name?: string;
  category?: string;
  error?: string;
}

/**
 * Builder/Locality forms (and the Project form when no projectId is passed) pick amenities
 * from one shared master list (see the Amenity model's own comment) rather than free text, so
 * a reusable amenity still needs to exist in that list once — this is the inline "+ New
 * Amenity" creation path, mirroring createBuilderInlineAction/createLocalityInlineAction.
 * Case-insensitive find-or-create so two admins typing "Gym" and "gym" don't fragment the
 * vocabulary into two rows.
 *
 * When called with a projectId (from the Project form), the new amenity is instead scoped
 * private to that project (Amenity.projectId set) -- it never joins the shared list and never
 * appears in another project's, or Builder/Locality's, picker. The existing-row lookup is
 * scoped the same way, so re-adding the same name for the same project reuses that project's
 * own private row instead of creating duplicates, but never matches a *different* project's
 * private amenity.
 *
 * `category` is free text (see the Amenity model's own comment) -- defaults to "CONVENIENCE"
 * to match the column default when the caller doesn't specify a section, same as before this
 * accepted a category at all.
 */
export async function createAmenityInlineAction(name: string, projectId?: string, category?: string): Promise<AmenityInlineCreateResult> {
  await requireMutateSession();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required" };
  const trimmedCategory = category?.trim() || "CONVENIENCE";

  const existing = await prisma.amenity.findFirst({
    where: projectId
      ? { name: { equals: trimmed, mode: "insensitive" }, OR: [{ projectId: null }, { projectId }] }
      : { name: { equals: trimmed, mode: "insensitive" }, projectId: null },
    select: { id: true, name: true, category: true },
  });
  if (existing) return { id: existing.id, name: existing.name, category: existing.category };

  try {
    const slug = await ensureUniqueSlug(trimmed, async (candidate) => {
      const clash = await prisma.amenity.findUnique({ where: { slug: candidate } });
      return Boolean(clash);
    });
    const created = await prisma.amenity.create({
      data: { slug, name: trimmed, category: trimmedCategory, projectId: projectId ?? null },
      select: { id: true, name: true, category: true },
    });
    return { id: created.id, name: created.name, category: created.category };
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}
