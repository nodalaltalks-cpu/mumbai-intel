"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { clearPublicSessionCookie, setPublicSessionCookie } from "@/lib/public-auth/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { sendPasswordResetEmail } from "@/lib/email";

const RESET_TOKEN_TTL_MINUTES = 30;

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Same absolute-URL pattern used for metadata/sitemap elsewhere (app/layout.tsx, app/sitemap.ts, etc.). */
function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

// ── Sign up ─────────────────────────────────────────────────────────────

const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export interface PublicAuthState {
  error?: string;
  success?: string;
}

export async function signupAction(_prevState: PublicAuthState, formData: FormData): Promise<PublicAuthState> {
  const ip = await getClientIp();
  const limit = checkRateLimit(`signup:${ip}`, 10, 60 * 15);
  if (!limit.allowed) return { error: "Too many attempts. Please try again in a few minutes." };

  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, email, password } = parsed.data;

  const existing = await prisma.publicUser.findUnique({ where: { email } });
  if (existing) return { error: "An account with this email already exists." };

  const passwordHash = await hashPassword(password);
  const user = await prisma.publicUser.create({
    data: { name, email, passwordHash, provider: "CREDENTIALS", lastLoginAt: new Date() },
  });

  await setPublicSessionCookie({ userId: user.id, email: user.email, name: user.name, image: user.image });
  redirect("/");
}

// ── Log in ──────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

/**
 * One login form for everyone. Founder/staff accounts (the `User` table) are
 * checked first, then public accounts (`PublicUser`) — the two systems keep
 * their own session cookies and tables (see lib/public-auth/token.ts), this
 * just tries both against the same email/password before giving up. Whichever
 * table matches decides both the session that gets set and the redirect.
 */
export async function loginAction(_prevState: PublicAuthState, formData: FormData): Promise<PublicAuthState> {
  const ip = await getClientIp();
  const limit = checkRateLimit(`login:${ip}`, 10, 60 * 15);
  if (!limit.allowed) return { error: "Too many attempts. Please try again in a few minutes." };

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { email, password } = parsed.data;

  const admin = await prisma.user.findUnique({ where: { email } });
  if (admin && admin.isActive && (await verifyPassword(password, admin.passwordHash))) {
    await prisma.user.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    await setSessionCookie({ userId: admin.id, email: admin.email, name: admin.name, role: admin.role });
    redirect("/admin");
  }

  const user = await prisma.publicUser.findUnique({ where: { email } });
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    // Same generic message whether the account doesn't exist, is Google-only, is an
    // inactive admin, or the password is wrong — never let a login form reveal which.
    return { error: "Invalid email or password" };
  }

  await prisma.publicUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await setPublicSessionCookie({ userId: user.id, email: user.email, name: user.name, image: user.image });
  redirect("/account");
}

export async function logoutAction(): Promise<void> {
  await clearPublicSessionCookie();
  redirect("/");
}

// ── Forgot password ─────────────────────────────────────────────────────

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

export async function requestPasswordResetAction(_prevState: PublicAuthState, formData: FormData): Promise<PublicAuthState> {
  const ip = await getClientIp();
  const ipLimit = checkRateLimit(`reset-request:${ip}`, 5, 60 * 15);
  if (!ipLimit.allowed) return { error: "Too many attempts. Please try again in a few minutes." };

  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { email } = parsed.data;

  const successState: PublicAuthState = { success: "If an account exists for that email, we've sent a password reset link." };

  // Keyed on the submitted email (in addition to IP above) so distributing requests
  // across many IPs can't be used to spam a single target's inbox.
  const emailLimit = checkRateLimit(`reset-request-email:${email}`, 5, 60 * 15);
  if (!emailLimit.allowed) return successState; // same generic response — a limit hit here must not reveal anything either

  const user = await prisma.publicUser.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return successState; // never reveal existence, or offer to "reset" an OAuth-only account

  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.publicPasswordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashResetToken(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
    },
  });

  const resetUrl = `${getSiteUrl()}/reset-password?token=${token}`;
  await sendPasswordResetEmail(email, resetUrl, RESET_TOKEN_TTL_MINUTES);

  return successState;
}

// ── Reset password ──────────────────────────────────────────────────────

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Missing reset token"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function resetPasswordAction(_prevState: PublicAuthState, formData: FormData): Promise<PublicAuthState> {
  const ip = await getClientIp();
  const limit = checkRateLimit(`reset-confirm:${ip}`, 10, 60 * 15);
  if (!limit.allowed) return { error: "Too many attempts. Please try again in a few minutes." };

  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { token, password } = parsed.data;

  const tokenHash = hashResetToken(token);
  const record = await prisma.publicPasswordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { error: "This reset link is invalid or has expired. Request a new one." };
  }

  const passwordHash = await hashPassword(password);
  await prisma.publicUser.update({ where: { id: record.userId }, data: { passwordHash } });
  await prisma.publicPasswordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  return { success: "Your password has been reset. You can now sign in." };
}
