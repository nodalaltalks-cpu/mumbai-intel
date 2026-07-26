"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { friendlyPrismaError } from "./errors";

const microMarketSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

export interface MicroMarketActionState {
  error?: string;
}

export async function addMicroMarketAction(
  localityId: string,
  _prevState: MicroMarketActionState,
  formData: FormData
): Promise<MicroMarketActionState> {
  await requireMutateSession();

  const parsed = microMarketSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const root = slugify(parsed.data.name) || "micro-market";
  let slug = root;
  let attempt = 1;
  for (;;) {
    const existing = await prisma.microMarket.findFirst({ where: { localityId, slug } });
    if (!existing) break;
    attempt += 1;
    slug = `${root}-${attempt}`;
  }

  try {
    await prisma.microMarket.create({ data: { localityId, name: parsed.data.name, slug } });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath(`/admin/localities/${localityId}/edit`);
  return {};
}

export async function deleteMicroMarketAction(microMarketId: string): Promise<{ error?: string }> {
  await requireMutateSession();
  const mm = await prisma.microMarket.delete({ where: { id: microMarketId } });
  revalidatePath(`/admin/localities/${mm.localityId}/edit`);
  return {};
}
