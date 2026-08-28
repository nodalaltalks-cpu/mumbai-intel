"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPublicSession } from "@/lib/public-auth/session";
import { recalculatePublicUserCompletion, getMilestoneCrossed } from "@/lib/profile-completion";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import { friendlyPrismaError } from "@/lib/actions/errors";
import { COUNTRY_CALLING_CODES, isValidPhoneNumber } from "@/lib/country-codes";

const emptyToUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);

const GENDERS = ["MALE", "FEMALE", "PREFER_NOT_TO_SAY"] as const;
const VALID_DIAL_CODES = new Set(COUNTRY_CALLING_CODES.map((c) => c.dialCode));

const profileSchema = z.object({
  name: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  // Real length validated below (against phoneCountryCode, which may not be
  // part of THIS particular per-field save -- see the `before.phoneCountryCode`
  // fallback further down) -- min(6) here is just a cheap first-pass filter.
  phone: z.preprocess(emptyToUndefined, z.string().trim().min(6, "Enter a valid phone number").optional()),
  phoneCountryCode: z.preprocess(emptyToUndefined, z.string().refine((v) => VALID_DIAL_CODES.has(v), "Unrecognized country code").optional()),
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
 * Saves the PublicUser identity/personal fields this app lets a user edit
 * themselves — email/password stay out of scope (auth surface). Called as a
 * per-field auto-save (Section 9): each call only ever includes the FormData
 * keys for the ONE field that just changed (plus "dobSubmitted", since the
 * three day/month/year selects are one logical field), gated by
 * `formData.has(...)` the same way lib/actions/user-preferences.ts already
 * gates its independent preference cards — a save for "gender" alone must
 * never blank out "name"/"phone"/etc. that a different, earlier auto-save
 * already persisted (this was the actual root cause of Section 8's "Personal
 * Details save error... previously filled information disappears" bug: the
 * old version always wrote every field, defaulting anything absent from the
 * current submission to null).
 *
 * Recomputes profileCompletionPercent afterward via lib/profile-completion.ts,
 * the one place that ever writes that column.
 */
export async function updatePublicProfileAction(_prevState: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const session = await getPublicSession();
  if (!session) return { error: "Sign in to edit your profile." };

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    phoneCountryCode: formData.get("phoneCountryCode"),
    city: formData.get("city"),
    currentLocality: formData.get("currentLocality"),
    dobDay: formData.get("dobDay"),
    dobMonth: formData.get("dobMonth"),
    dobYear: formData.get("dobYear"),
    gender: formData.get("gender"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  let dobValue: Date | null | undefined; // undefined = day/month/year weren't part of this particular save
  if (formData.has("dobSubmitted")) {
    const dob = parseDateOfBirth(parsed.data.dobDay, parsed.data.dobMonth, parsed.data.dobYear);
    if ("error" in dob) return { error: dob.error };
    dobValue = dob.value;
  }

  const before = await prisma.publicUser.findUnique({
    where: { id: session.userId },
    select: { profileCompletionPercent: true, name: true, phone: true, phoneCountryCode: true, dateOfBirth: true, gender: true },
  });

  // A save for "phone" alone (the common case -- see the file-level comment
  // above) never carries phoneCountryCode in the same FormData, so validate
  // against whichever dial code IS part of this save if present, otherwise
  // the one already on the account. A non-empty phone that fails this check
  // is rejected outright rather than silently persisted -- this is the actual
  // fix for the reported bug: an incomplete number (e.g. 7 digits of a
  // 10-digit Indian mobile number) previously passed the old min(6) check
  // and saved as if valid.
  if (formData.has("phone") && parsed.data.phone) {
    const dialCode = parsed.data.phoneCountryCode ?? before?.phoneCountryCode ?? "+91";
    if (!isValidPhoneNumber(parsed.data.phone, dialCode)) {
      return { error: dialCode === "+91" ? "Enter a valid 10-digit phone number." : "Enter a valid phone number." };
    }
  }

  const data: { name?: string | null; phone?: string | null; phoneCountryCode?: string; city?: string | null; currentLocality?: string | null; dateOfBirth?: Date | null; gender?: string | null } = {};
  if (formData.has("name")) data.name = parsed.data.name ?? null;
  if (formData.has("phone")) data.phone = parsed.data.phone ?? null;
  // phoneCountryCode has no "empty" state -- it always defaults back to India rather than going null, so a selector can never be left in a blank/invalid state.
  if (formData.has("phoneCountryCode")) data.phoneCountryCode = parsed.data.phoneCountryCode ?? "+91";
  if (formData.has("city")) data.city = parsed.data.city ?? null;
  if (formData.has("currentLocality")) data.currentLocality = parsed.data.currentLocality ?? null;
  if (dobValue !== undefined) data.dateOfBirth = dobValue;
  if (formData.has("gender")) data.gender = parsed.data.gender ?? null;

  try {
    await prisma.publicUser.update({ where: { id: session.userId }, data });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  const completionPercent = await recalculatePublicUserCompletion(session.userId);
  if (Object.keys(data).length > 0) {
    await recordResearchEvent("PROFILE_UPDATED", { entityType: "PublicUser", entityId: session.userId, metadata: { section: "basic_profile" } });
  }

  // Field-level completion analytics (Part 10) — one event per field that just
  // transitioned from empty to filled in THIS save, field key only, never the
  // value. Only checks fields this save actually touched.
  for (const field of ["name", "phone", "dateOfBirth", "gender"] as const) {
    if (!(field in data)) continue;
    const wasEmpty = !before?.[field];
    const isFilledNow = Boolean(data[field]);
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
