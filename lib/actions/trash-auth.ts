"use server";

import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/guard";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { grantTrashReauth } from "@/lib/auth/trash-reauth";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";

export interface TrashReauthState {
  error?: string;
  success?: boolean;
}

/** Rendered by the page-level gate (app/admin/(dashboard)/trash/page.tsx) and the Settings "Change Trash Password" section to decide which form to show — setup vs. enter vs. change. */
export async function hasTrashPassword(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { trashPasswordHash: true } });
  return Boolean(user?.trashPasswordHash);
}

const reauthSchema = z.object({ password: z.string().min(1, "Enter your Trash password") });

/**
 * Section 18/6's re-authentication gate — checks against `User.trashPasswordHash`, a credential
 * separate from the founder's login password (lib/auth/password.ts's passwordHash), never the
 * same hash. Rate-limited per account, same shared limiter used for login/signup/reset elsewhere
 * (lib/rate-limit.ts) — 5 attempts per 15 minutes, since unlimited guesses were previously possible.
 */
export async function reauthenticateForTrashAction(_prevState: TrashReauthState, formData: FormData): Promise<TrashReauthState> {
  const session = await requireAdminSession();

  const limit = checkRateLimit(`trash-reauth:${session.userId}`, 5, 15 * 60);
  if (!limit.allowed) {
    return { error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).` };
  }

  const parsed = reauthSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return { error: "Account not found" };
  if (!user.trashPasswordHash) return { error: "No Trash password is set up yet." };

  const valid = await verifyPassword(parsed.data.password, user.trashPasswordHash);
  if (!valid) {
    await logAudit(session.userId, "trash.reauth_failed", "Trash", session.userId);
    return { error: "Incorrect Trash password." };
  }

  await grantTrashReauth(session.userId);
  await logAudit(session.userId, "trash.reauth", "Trash", session.userId);
  return { success: true };
}

const setupSchema = z
  .object({
    loginPassword: z.string().min(1, "Enter your login password"),
    newPassword: z.string().min(8, "Trash password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm the Trash password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

/** First-time setup — requires the founder's existing login password as proof of identity before a brand-new Trash credential is created, so setup itself can't be done by anyone who's merely riding an already-open admin session. */
export async function setupTrashPasswordAction(_prevState: TrashReauthState, formData: FormData): Promise<TrashReauthState> {
  const session = await requireAdminSession();

  const limit = checkRateLimit(`trash-setup:${session.userId}`, 5, 15 * 60);
  if (!limit.allowed) {
    return { error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).` };
  }

  const parsed = setupSchema.safeParse({
    loginPassword: formData.get("loginPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return { error: "Account not found" };
  if (user.trashPasswordHash) return { error: "A Trash password is already set — use Change Trash Password in Settings instead." };

  const validLogin = await verifyPassword(parsed.data.loginPassword, user.passwordHash);
  if (!validLogin) return { error: "Your login password is incorrect." };

  const trashPasswordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: session.userId }, data: { trashPasswordHash } });
  await grantTrashReauth(session.userId);
  await logAudit(session.userId, "trash.password_setup", "Trash", session.userId);
  return { success: true };
}

const resetSchema = z
  .object({
    loginPassword: z.string().min(1, "Enter your login password"),
    newPassword: z.string().min(8, "Trash password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm the Trash password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

/** "Forgot Trash password" — the login password is a different credential the founder always has, so proving that is a legitimate, real reset rather than a bypass. Same rate limit bucket family as setup/reauth. */
export async function resetTrashPasswordAction(_prevState: TrashReauthState, formData: FormData): Promise<TrashReauthState> {
  const session = await requireAdminSession();

  const limit = checkRateLimit(`trash-reset:${session.userId}`, 5, 15 * 60);
  if (!limit.allowed) {
    return { error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).` };
  }

  const parsed = resetSchema.safeParse({
    loginPassword: formData.get("loginPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return { error: "Account not found" };

  const validLogin = await verifyPassword(parsed.data.loginPassword, user.passwordHash);
  if (!validLogin) {
    await logAudit(session.userId, "trash.password_reset_failed", "Trash", session.userId);
    return { error: "Your login password is incorrect." };
  }

  const trashPasswordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: session.userId }, data: { trashPasswordHash } });
  await grantTrashReauth(session.userId);
  await logAudit(session.userId, "trash.password_reset", "Trash", session.userId);
  return { success: true };
}

const changeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current Trash password"),
    newPassword: z.string().min(8, "Trash password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm the new Trash password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

/** Change flow (Settings page) — requires the current Trash password specifically, not just an active reauth cookie, so changing it always re-proves the credential being replaced. */
export async function changeTrashPasswordAction(_prevState: TrashReauthState, formData: FormData): Promise<TrashReauthState> {
  const session = await requireAdminSession();

  const limit = checkRateLimit(`trash-change:${session.userId}`, 5, 15 * 60);
  if (!limit.allowed) {
    return { error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).` };
  }

  const parsed = changeSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return { error: "Account not found" };
  if (!user.trashPasswordHash) return { error: "No Trash password is set up yet — set one up first from Trash." };

  const valid = await verifyPassword(parsed.data.currentPassword, user.trashPasswordHash);
  if (!valid) return { error: "Current Trash password is incorrect." };

  const trashPasswordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: session.userId }, data: { trashPasswordHash } });
  await logAudit(session.userId, "trash.password_changed", "Trash", session.userId);
  return { success: true };
}
