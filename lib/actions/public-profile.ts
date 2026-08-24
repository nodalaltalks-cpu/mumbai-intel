"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPublicSession } from "@/lib/public-auth/session";
import { recalculatePublicUserCompletion, getMilestoneCrossed } from "@/lib/profile-completion";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import { friendlyPrismaError } from "@/lib/actions/errors";

const emptyToUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);

const GENDERS = ["MALE", "FEMALE", "PREFER_NOT_TO_SAY"] as const;

const profileSchema = z.object({
  name: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  phone: z.preprocess(emptyToUndefined, z.string().trim().min(6, "Enter a valid phone number").optional()),
  city: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  currentLocality: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  dobDay: z.preprocess(emptyToUndefined, z.string().optional()),
  dobMonth: z.preprocess(emptyToUndefined, z.string().optional()),
  dobYear: z.preprocess(emptyToUndefined, z.string().optional()),
  gender: z.preprocess(emptyToUndefined, z.enum(GENDERS).optional()),
});

/**
 * Combines the three DAY/MONTH/YEAR selects into one calendar date (private,
 * optional -- Part 6's "simple mobile-friendly picker" over a raw `<input
 * type=date>`, which is fiddly to operate on a phone). All three blank is a
 * legitimate "skipped" state (null, no error); a partial or impossible date
 * (e.g. day 31 + month 2) is rejected rather than silently dropped or
 * silently rounded. Date.UTC keeps this a pure calendar day with no
 * timezone-dependent drift, matching the schema comment.
 */
function parseDateOfBirth(day?: string, month?: string, year?: string): { value: Date | null } | { error: string } {
  if (!day && !month && !year) return { value: null };
  if (!day || !month || !year) return { error: "Enter a complete date of birth, or leave all three blank." };
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y) || y < 1900 || y > currentYear) {
    return { error: "Enter a valid date of birth." };
  }
  const candidate = new Date(Date.UTC(y, m - 1, d));
  const isRealCalendarDate = candidate.getUTCFullYear() === y && candidate.getUTCMonth() === m - 1 && candidate.getUTCDate() === d;
  if (!isRealCalendarDate) return { error: "Enter a valid date of birth." };
  return { value: candidate };
}

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
    dobDay: formData.get("dobDay"),
    dobMonth: formData.get("dobMonth"),
    dobYear: formData.get("dobYear"),
    gender: formData.get("gender"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const dob = parseDateOfBirth(parsed.data.dobDay, parsed.data.dobMonth, parsed.data.dobYear);
  if ("error" in dob) return { error: dob.error };

  const before = await prisma.publicUser.findUnique({
    where: { id: session.userId },
    select: { profileCompletionPercent: true, name: true, phone: true, dateOfBirth: true, gender: true },
  });

  const nextValues = {
    name: parsed.data.name ?? null,
    phone: parsed.data.phone ?? null,
    dateOfBirth: dob.value,
    gender: parsed.data.gender ?? null,
  };

  try {
    await prisma.publicUser.update({
      where: { id: session.userId },
      data: {
        ...nextValues,
        city: parsed.data.city ?? null,
        currentLocality: parsed.data.currentLocality ?? null,
      },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  const completionPercent = await recalculatePublicUserCompletion(session.userId);
  await recordResearchEvent("PROFILE_UPDATED", { entityType: "PublicUser", entityId: session.userId, metadata: { section: "basic_profile" } });

  // Field-level completion analytics (Part 10) — one event per field that just
  // transitioned from empty to filled in this save, field key only, never the value.
  for (const field of ["name", "phone", "dateOfBirth", "gender"] as const) {
    const wasEmpty = !before?.[field];
    const isFilledNow = Boolean(nextValues[field]);
    if (wasEmpty && isFilledNow) {
      await recordResearchEvent("PROFILE_FIELD_COMPLETED", { entityType: "PublicUser", entityId: session.userId, metadata: { field } });
    }
  }
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
