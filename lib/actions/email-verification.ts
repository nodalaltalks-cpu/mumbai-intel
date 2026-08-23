"use server";

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getPublicSession } from "@/lib/public-auth/session";
import { recalculatePublicUserCompletion, getMilestoneCrossed } from "@/lib/profile-completion";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmailVerificationEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

const VERIFY_TOKEN_TTL_MINUTES = 30;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

export interface EmailVerificationState {
  error?: string;
  success?: string;
}

/** Sends (or re-sends) a verification link to the signed-in user's own email. Rate-limited per account, not per-IP, since it always targets the caller's own address — never someone else's. */
export async function requestEmailVerificationAction(): Promise<EmailVerificationState> {
  const session = await getPublicSession();
  if (!session) return { error: "Sign in to verify your email." };

  const limit = checkRateLimit(`verify-email-request:${session.userId}`, 5, 60 * 15);
  if (!limit.allowed) return { error: "Too many attempts. Please try again in a few minutes." };

  const user = await prisma.publicUser.findUnique({ where: { id: session.userId } });
  if (!user) return { error: "Account not found." };
  if (user.emailVerifiedAt) return { success: "Your email is already verified." };

  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.publicEmailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MINUTES * 60 * 1000),
    },
  });

  const verifyUrl = `${getSiteUrl()}/verify-email?token=${token}`;
  const sent = await sendEmailVerificationEmail(user.email, verifyUrl, VERIFY_TOKEN_TTL_MINUTES);
  if (!sent) {
    await logAudit(null, "email_verification_email.failed", "PublicUser", user.id);
    return { error: "Couldn't send the verification email right now. Please try again shortly." };
  }

  return { success: `Verification link sent to ${user.email}.` };
}

/** Confirms a token from the /verify-email?token=... link. Single-use (usedAt), short-lived, same shape as resetPasswordAction. */
export async function verifyEmailAction(_prevState: EmailVerificationState, formData: FormData): Promise<EmailVerificationState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Missing verification token." };

  const record = await prisma.publicEmailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { error: "This verification link is invalid or has expired. Request a new one from your profile." };
  }

  const before = (await prisma.publicUser.findUnique({ where: { id: record.userId }, select: { profileCompletionPercent: true } }))
    ?.profileCompletionPercent ?? 0;

  await prisma.publicUser.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
  await prisma.publicEmailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  const completionPercent = await recalculatePublicUserCompletion(record.userId);
  await recordResearchEvent("PROFILE_FIELD_COMPLETED", { entityType: "PublicUser", entityId: record.userId, metadata: { field: "emailVerified" } });
  if (before !== 100 && completionPercent === 100) {
    await recordResearchEvent("PROFILE_COMPLETED", { entityType: "PublicUser", entityId: record.userId, metadata: { source: "email_verification" } });
  } else {
    const milestone = getMilestoneCrossed(before, completionPercent);
    if (milestone) {
      await recordResearchEvent(`PROFILE_COMPLETION_${milestone}` as Parameters<typeof recordResearchEvent>[0], {
        entityType: "PublicUser",
        entityId: record.userId,
      });
    }
  }

  return { success: "Your email is verified." };
}
