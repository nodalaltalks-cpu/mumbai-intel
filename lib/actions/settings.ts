"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAnySession, requireAdminSession } from "@/lib/auth/guard";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export interface ChangePasswordState {
  error?: string;
  success?: boolean;
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New password and confirmation do not match",
    path: ["confirmPassword"],
  });

export async function changeOwnPasswordAction(
  _prevState: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const session = await requireAnySession();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return { error: "Account not found" };

  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return { error: "Current password is incorrect" };

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: session.userId }, data: { passwordHash } });
  await logAudit(session.userId, "user.password.change", "User", session.userId);

  return { success: true };
}

export interface SiteSettingsState {
  error?: string;
  success?: boolean;
}

/** Two configurable review-destination links (Section 15's resolved-report follow-up) — a small generic key-value SiteSetting table, not a single-purpose model, so a future admin-configurable value is a new row, not a new migration. */
export async function updateSiteSettingsAction(_prevState: SiteSettingsState, formData: FormData): Promise<SiteSettingsState> {
  const session = await requireAdminSession();

  const schema = z.object({
    review_google_url: z.string().trim().url().optional().or(z.literal("")),
    review_appstore_url: z.string().trim().url().optional().or(z.literal("")),
  });
  const parsed = schema.safeParse({
    review_google_url: formData.get("review_google_url"),
    review_appstore_url: formData.get("review_appstore_url"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid URL" };

  // Two separate calls (find, then create-or-update) instead of upsert() -- the Neon HTTP
  // adapter has no transaction support, and Prisma's upsert() relies on one under the hood
  // (confirmed by direct testing: "Transactions are not supported in HTTP mode"). Same
  // already-established workaround this codebase uses elsewhere (see syncProjectAmenities).
  for (const [key, value] of Object.entries(parsed.data)) {
    const existing = await prisma.siteSetting.findUnique({ where: { key } });
    if (existing) {
      await prisma.siteSetting.update({ where: { key }, data: { value: value ?? "" } });
    } else {
      await prisma.siteSetting.create({ data: { key, value: value ?? "" } });
    }
  }
  await logAudit(session.userId, "site-settings.update", "SiteSetting", "review-links");
  revalidatePath("/admin/settings");
  return { success: true };
}
