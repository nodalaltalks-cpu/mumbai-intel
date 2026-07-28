"use server";

import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { sendNewsletterSignupEmail } from "@/lib/email";

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

  await sendNewsletterSignupEmail(parsed.data.email);
  return { success: "Thanks — you're on the list." };
}
