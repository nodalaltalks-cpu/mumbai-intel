"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPublicSession } from "@/lib/public-auth/session";
import { recalculatePublicUserCompletion, getMilestoneCrossed } from "@/lib/profile-completion";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import { friendlyPrismaError } from "@/lib/actions/errors";

const emptyToUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);

const profileSchema = z.object({
  name: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  phone: z.preprocess(emptyToUndefined, z.string().trim().min(6, "Enter a valid phone number").optional()),
  city: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  currentLocality: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
});

export interface ProfileFormState {
  error?: string;
  success?: string;
  completionPercent?: number;
}

/**
 * Saves the two core PublicUser identity fields this app lets a user edit
 * themselves — email/password stay out of scope (auth surface). Recomputes
 * profileCompletionPercent afterward via lib/profile-completion.ts, the one
 * place that ever writes that column.
 */
export async function updatePublicProfileAction(_prevState: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const session = await getPublicSession();
  if (!session) return { error: "Sign in to edit your profile." };

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    city: formData.get("city"),
    currentLocality: formData.get("currentLocality"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const before = await prisma.publicUser.findUnique({ where: { id: session.userId }, select: { profileCompletionPercent: true } });

  try {
    await prisma.publicUser.update({
      where: { id: session.userId },
      data: {
        name: parsed.data.name ?? null,
        phone: parsed.data.phone ?? null,
        city: parsed.data.city ?? null,
        currentLocality: parsed.data.currentLocality ?? null,
      },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  const completionPercent = await recalculatePublicUserCompletion(session.userId);
  await recordResearchEvent("PROFILE_UPDATED", { entityType: "PublicUser", entityId: session.userId, metadata: { section: "basic_profile" } });
  const beforePercent = before?.profileCompletionPercent ?? 0;
  if (beforePercent !== 100 && completionPercent === 100) {
    await recordResearchEvent("PROFILE_COMPLETED", { entityType: "PublicUser", entityId: session.userId, metadata: { source: "basic_profile" } });
  } else {
    const milestone = getMilestoneCrossed(beforePercent, completionPercent);
    if (milestone) {
      await recordResearchEvent(`PROFILE_COMPLETION_${milestone}` as Parameters<typeof recordResearchEvent>[0], {
        entityType: "PublicUser",
        entityId: session.userId,
      });
    }
  }

  revalidatePath("/account");
  return { success: "Profile saved.", completionPercent };
}
