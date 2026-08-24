"use server";

import { requirePublicSession } from "@/lib/public-auth/guard";
import { prisma } from "@/lib/prisma";
import { notifyAllAdmins } from "@/lib/notifications";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import { checkRateLimit } from "@/lib/rate-limit";

export interface PhoneVerificationState {
  error?: string;
  success?: string;
}

/**
 * Optional trust/identity layer, not a lead-gen mechanism — phone was never
 * required to browse or research, and this doesn't change that. No live OTP
 * provider exists yet (see AuthProvider's MOBILE_OTP note in schema.prisma),
 * so this is deliberately a v1 stub: it records the user's explicit request
 * and notifies the founder, who confirms out-of-band and sets
 * PublicUser.phoneVerifiedAt manually. The number is never shared with
 * brokers/developers and no marketing message is sent as a result of this action.
 */
export async function requestPhoneVerificationAction(): Promise<PhoneVerificationState> {
  const session = await requirePublicSession("/account");
  const limit = checkRateLimit(`phone-verify-request:${session.userId}`, 5, 60 * 15);
  if (!limit.allowed) return { error: "Too many requests. Please try again in a few minutes." };

  const user = await prisma.publicUser.findUnique({ where: { id: session.userId }, select: { phone: true, phoneVerifiedAt: true, email: true, name: true } });
  if (!user?.phone) return { error: "Add a phone number above first, then request verification." };
  if (user.phoneVerifiedAt) return { success: "Your phone is already verified." };

  await recordResearchEvent("PHONE_VERIFICATION_REQUESTED", { entityType: "PublicUser", entityId: session.userId });

  await notifyAllAdmins({
    type: "ADMIN_PHONE_VERIFICATION_REQUESTED",
    title: "Phone verification requested",
    body: `${user.name ?? user.email} requested verification for ${user.phone}.`,
    entityType: "PublicUser",
    entityId: session.userId,
  });

  return { success: "Thanks, we'll confirm your number and verify it shortly." };
}
