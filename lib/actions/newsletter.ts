"use server";

import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { sendNewsletterSignupEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getPublicSession } from "@/lib/public-auth/session";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import { friendlyPrismaError } from "@/lib/actions/errors";

const newsletterSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

export interface NewsletterFormState {
  error?: string;
  success?: string;
}

export async function subscribeNewsletterAction(_prevState: NewsletterFormState, formData: FormData): Promise<NewsletterFormState> {
  const ip = await getClientIp();
  const limit = checkRateLimit(`newsletter:${ip}`, 5, 60 * 15);
  if (!limit.allowed) return { error: "Too many attempts. Please try again in a few minutes." };

  const parsed = newsletterSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const email = parsed.data.email;

  const session = await getPublicSession();

  // Find-then-create-or-update, not upsert() — the Neon HTTP adapter has no
  // interactive-transaction support upsert() needs internally (see
  // lib/prisma.ts), same pattern used throughout this codebase (e.g.
  // lib/actions/brochure.ts). Wrapped in try/catch (previously missing) so a
  // race-condition unique-constraint violation (two concurrent submits of a
  // brand-new email, or a logged-in user whose account already has a
  // NewsletterSubscriber row via a different email — both `email` and
  // `publicUserId` are @unique) surfaces as a normal inline error instead of
  // crashing the whole page the form was submitted from.
  try {
    const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });

    if (existing?.status === "SUBSCRIBED") {
      return { success: "You're already subscribed — thanks for sticking around." };
    }

    if (existing) {
      await prisma.newsletterSubscriber.update({
        where: { id: existing.id },
        data: { status: "SUBSCRIBED", subscribedAt: new Date(), unsubscribedAt: null, publicUserId: session?.userId ?? existing.publicUserId },
      });
    } else {
      await prisma.newsletterSubscriber.create({
        data: { email, source: "footer", publicUserId: session?.userId ?? null },
      });
    }
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  // Best-effort admin notification email — the subscription itself already
  // committed above, so a failure here (e.g. Resend misconfigured) must not
  // make the action report failure for a subscribe that actually succeeded.
  try {
    await sendNewsletterSignupEmail(email);
  } catch (error) {
    console.error("[newsletter] admin notification email failed:", error);
  }
  await recordResearchEvent("NEWSLETTER_SUBSCRIBED", { metadata: { source: "footer" } });

  return { success: "Thanks — you're on the list." };
}

export interface UnsubscribeState {
  error?: string;
  success?: string;
}

/**
 * DB-level unsubscribe — ready for a future signed-token email link (not
 * built yet, per the ask's own "future" framing). Callable today from any
 * surface that already knows the subscriber's email (e.g. a settings page),
 * without requiring that link to exist first.
 */
export async function unsubscribeNewsletterAction(_prevState: UnsubscribeState, formData: FormData): Promise<UnsubscribeState> {
  const parsed = newsletterSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email: parsed.data.email } });
  if (!existing || existing.status === "UNSUBSCRIBED") {
    return { success: "You're not on the list — nothing to do." };
  }

  await prisma.newsletterSubscriber.update({
    where: { id: existing.id },
    data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
  });
  await recordResearchEvent("NEWSLETTER_UNSUBSCRIBED");

  return { success: "You've been unsubscribed." };
}
