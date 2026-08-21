"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { sendNewsletterSignupEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getPublicSession } from "@/lib/public-auth/session";
import { recordResearchEvent } from "@/lib/analytics/research-events";

const newsletterSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  source: z.string().trim().min(1).max(40).optional(),
});

export interface NewsletterFormState {
  error?: string;
  success?: string;
}

/**
 * One account can hold several subscriptions, one per distinct email
 * address (email is the only uniqueness boundary — see NewsletterSubscriber
 * in prisma/schema.prisma). Every branch below returns one of the three
 * user-facing messages the product spec requires; nothing derived from a
 * caught error (Prisma error text, constraint name, SQL) is ever returned
 * to the client — friendlyPrismaError() exists for internal admin surfaces,
 * not this one, since even its output can name a raw column.
 */
export async function subscribeNewsletterAction(_prevState: NewsletterFormState, formData: FormData): Promise<NewsletterFormState> {
  const ip = await getClientIp();
  const limit = checkRateLimit(`newsletter:${ip}`, 5, 60 * 15);
  if (!limit.allowed) return { error: "Too many attempts. Please try again in a few minutes." };

  const parsed = newsletterSchema.safeParse({ email: formData.get("email"), source: formData.get("source") ?? undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid email address" };
  const email = parsed.data.email;
  const source = parsed.data.source ?? "footer";

  const session = await getPublicSession();

  // Find-then-create-or-update, not upsert() — the Neon HTTP adapter has no
  // interactive-transaction support upsert() needs internally (see
  // lib/prisma.ts), same pattern used throughout this codebase (e.g.
  // lib/actions/brochure.ts). Still wrapped in try/catch: a race between two
  // concurrent submits of the same brand-new email can both pass the
  // find-check before either create() lands, so the loser still hits
  // email's unique constraint even with the find-then-create-or-update
  // shape — that case is treated as "already subscribed", not surfaced as
  // an error, since the outcome the user wanted (being on the list) is true.
  let alreadySubscribed = false;
  try {
    const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });

    if (existing?.status === "SUBSCRIBED") {
      alreadySubscribed = true;
    } else if (existing) {
      await prisma.newsletterSubscriber.update({
        where: { id: existing.id },
        data: { status: "SUBSCRIBED", subscribedAt: new Date(), unsubscribedAt: null, publicUserId: session?.userId ?? existing.publicUserId },
      });
    } else {
      try {
        await prisma.newsletterSubscriber.create({
          data: { email, source, publicUserId: session?.userId ?? null },
        });
      } catch (createError) {
        if (createError instanceof Prisma.PrismaClientKnownRequestError && createError.code === "P2002") {
          alreadySubscribed = true;
        } else {
          throw createError;
        }
      }
    }
  } catch (error) {
    console.error("[newsletter] subscribe failed:", error);
    return { error: "Something went wrong. Please try again." };
  }

  if (alreadySubscribed) {
    return { success: "You're already subscribed to these updates." };
  }

  // Best-effort admin notification email — the subscription itself already
  // committed above, so a failure here (e.g. Resend misconfigured) must not
  // make the action report failure for a subscribe that actually succeeded.
  try {
    await sendNewsletterSignupEmail(email);
  } catch (error) {
    console.error("[newsletter] admin notification email failed:", error);
  }
  await recordResearchEvent("NEWSLETTER_SUBSCRIBED", { metadata: { source } });

  return { success: "You're subscribed. We'll send you weekly property intelligence." };
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

  try {
    const existing = await prisma.newsletterSubscriber.findUnique({ where: { email: parsed.data.email } });
    if (!existing || existing.status === "UNSUBSCRIBED") {
      return { success: "You're not on the list — nothing to do." };
    }

    await prisma.newsletterSubscriber.update({
      where: { id: existing.id },
      data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
    });
  } catch (error) {
    console.error("[newsletter] unsubscribe failed:", error);
    return { error: "Something went wrong. Please try again." };
  }

  await recordResearchEvent("NEWSLETTER_UNSUBSCRIBED");

  return { success: "You've been unsubscribed." };
}
