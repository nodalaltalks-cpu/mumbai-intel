"use server";

import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { sendProjectInquiryEmail } from "@/lib/email";

const inquirySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().max(20).optional(),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(2000),
  projectName: z.string().trim().min(1),
  projectUrl: z.string().trim().min(1),
});

export interface ProjectInquiryFormState {
  error?: string;
  success?: string;
}

/** "Contact Developer" — routed to Mumbai Intel's own inbox (CONTACT_EMAIL), not the builder directly, since no verified builder email/phone is on file in the schema today. Same rate-limit pattern as submitContactMessageAction. */
export async function submitProjectInquiryAction(_prevState: ProjectInquiryFormState, formData: FormData): Promise<ProjectInquiryFormState> {
  const ip = await getClientIp();
  const limit = checkRateLimit(`project-inquiry:${ip}`, 5, 60 * 15);
  if (!limit.allowed) return { error: "Too many messages sent. Please try again in a few minutes." };

  const parsed = inquirySchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    message: formData.get("message"),
    projectName: formData.get("projectName"),
    projectUrl: formData.get("projectUrl"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { projectName, projectUrl, ...rest } = parsed.data;
  await sendProjectInquiryEmail({ ...rest, projectName, projectUrl });
  return { success: "Thanks — your inquiry has been sent. We'll connect you with the developer team soon." };
}
