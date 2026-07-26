"use server";

import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { sendContactMessageEmail } from "@/lib/email";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(4000),
});

export interface ContactFormState {
  error?: string;
  success?: string;
}

export async function submitContactMessageAction(_prevState: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const ip = await getClientIp();
  const limit = checkRateLimit(`contact:${ip}`, 5, 60 * 15);
  if (!limit.allowed) return { error: "Too many messages sent. Please try again in a few minutes." };

  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  await sendContactMessageEmail(parsed.data);
  return { success: "Thanks — your message has been sent. We'll get back to you soon." };
}
