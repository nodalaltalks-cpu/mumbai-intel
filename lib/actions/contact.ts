"use server";

import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { sendContactMessageEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getPublicSession } from "@/lib/public-auth/session";
import { CONTACT_SUBJECTS } from "@/lib/contact-constants";
import { createNotification, notifyAllAdmins } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { friendlyPrismaError } from "./errors";

const emptyToUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.preprocess(emptyToUndefined, z.string().trim().max(20).optional()),
  subject: z.preprocess(emptyToUndefined, z.enum(CONTACT_SUBJECTS).optional()),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(4000),
  sourcePage: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
});

export interface ContactFormState {
  error?: string;
  success?: string;
}

/**
 * Persists the enquiry (previously fire-and-forget email only — the founder
 * had no record of what was sent, and no way to track resolution) and keeps
 * the existing best-effort email notification alongside it, so nothing about
 * the notification path changes for the founder.
 */
export async function submitContactMessageAction(_prevState: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const ip = await getClientIp();
  const limit = checkRateLimit(`contact:${ip}`, 5, 60 * 15);
  if (!limit.allowed) return { error: "Too many messages sent. Please try again in a few minutes." };

  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    subject: formData.get("subject"),
    message: formData.get("message"),
    sourcePage: formData.get("sourcePage"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  const session = await getPublicSession();
  let enquiryId: string;

  try {
    const enquiry = await prisma.contactEnquiry.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone ?? null,
        subject: data.subject ?? null,
        message: data.message,
        publicUserId: session?.userId ?? null,
        sourcePage: data.sourcePage ?? null,
      },
    });
    enquiryId = enquiry.id;
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  // Best-effort from here — the enquiry is already saved above, so none of this can block the user's success message.
  await logAudit(session?.userId ?? null, "contact_enquiry.receive", "ContactEnquiry", enquiryId, {
    after: { name: data.name, email: data.email, subject: data.subject ?? null },
  });
  if (session?.userId) {
    await createNotification({
      type: "CONTACT_ENQUIRY_RECEIVED",
      title: "We've received your enquiry",
      body: "Thanks for reaching out — we've received your enquiry and will follow up soon.",
      recipientPublicUserId: session.userId,
      entityType: "ContactEnquiry",
      entityId: enquiryId,
    });
  }
  await notifyAllAdmins({
    type: "ADMIN_NEW_ENQUIRY",
    title: "New contact enquiry",
    body: `${data.name} — ${data.message.slice(0, 140)}`,
    entityType: "ContactEnquiry",
    entityId: enquiryId,
  });

  try {
    await sendContactMessageEmail({ name: data.name, email: data.email, message: data.message });
  } catch (error) {
    console.error("[contact] admin notification email failed:", error);
  }

  return { success: "Thanks, your message has been sent. We'll get back to you soon." };
}
