"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutateSession } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { friendlyPrismaError } from "./errors";
import type { InlineCreateResult } from "./builders";

const microMarketSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

export interface MicroMarketActionState {
  error?: string;
}

async function uniqueMicroMarketSlug(localityId: string, name: string): Promise<string> {
  const root = slugify(name) || "micro-market";
  let slug = root;
  let attempt = 1;
  for (;;) {
    const existing = await prisma.microMarket.findFirst({ where: { localityId, slug } });
    if (!existing) return slug;
    attempt += 1;
    slug = `${root}-${attempt}`;
  }
}

/**
 * ProjectForm's inline "+ New Micro market" — same shape as
 * createBuilderInlineAction/createLocalityInlineAction, name only, so an
 * EDITOR never has to leave the Project form and go find the right Locality
 * just to add a missing micro market.
 */
export async function createMicroMarketInlineAction(localityId: string, name: string): Promise<InlineCreateResult> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "localities.edit"))) {
    return { error: "You don't have permission to do this." };
  }
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required" };
  if (!localityId) return { error: "Select a locality first" };

  const slug = await uniqueMicroMarketSlug(localityId, trimmed);

  try {
    const created = await prisma.microMarket.create({ data: { localityId, name: trimmed, slug } });
    revalidatePath(`/admin/localities/${localityId}/edit`);
    return { id: created.id, name: created.name };
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}

export async function addMicroMarketAction(
  localityId: string,
  _prevState: MicroMarketActionState,
  formData: FormData
): Promise<MicroMarketActionState> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "localities.edit"))) {
    return { error: "You don't have permission to do this." };
  }

  const parsed = microMarketSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const slug = await uniqueMicroMarketSlug(localityId, parsed.data.name);

  try {
    await prisma.microMarket.create({ data: { localityId, name: parsed.data.name, slug } });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath(`/admin/localities/${localityId}/edit`);
  return {};
}

export async function deleteMicroMarketAction(microMarketId: string): Promise<{ error?: string }> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "localities.edit"))) {
    return { error: "You don't have permission to do this." };
  }
  const mm = await prisma.microMarket.delete({ where: { id: microMarketId } });
  revalidatePath(`/admin/localities/${mm.localityId}/edit`);
  return {};
}
