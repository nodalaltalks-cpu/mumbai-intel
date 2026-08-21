"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { friendlyPrismaError } from "./errors";

const updateSchema = z.object({
  status: z.enum(["NEW", "IN_PROGRESS", "RESOLVED"]),
  adminNotes: z.string().trim().max(2000).optional(),
});

export interface ContactEnquiryFormState {
  error?: string;
  success?: string;
}

export async function updateContactEnquiryAction(
  enquiryId: string,
  _prevState: ContactEnquiryFormState,
  formData: FormData
): Promise<ContactEnquiryFormState> {
  const session = await requireMutateSession();

  const parsed = updateSchema.safeParse({
    status: formData.get("status"),
    adminNotes: formData.get("adminNotes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await prisma.contactEnquiry.update({
      where: { id: enquiryId },
      data: { status: parsed.data.status, adminNotes: parsed.data.adminNotes ?? null },
    });
    await logAudit(session.userId, "contact_enquiry.update", "ContactEnquiry", enquiryId, { after: parsed.data });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath("/admin/contact-enquiries");
  return { success: "Saved." };
}
