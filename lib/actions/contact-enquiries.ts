"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutateSession, requireAdminSession } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { getAuditHistory } from "@/lib/admin-queries";
import { requireTrashReauth } from "@/lib/auth/trash-reauth";
import { friendlyPrismaError } from "./errors";
import type { ContactEnquiryStatus, NotificationType } from "@prisma/client";

export interface ContactEnquiryFormState {
  error?: string;
  success?: string;
}

const STATUS_NOTIFICATION_COPY: Partial<Record<ContactEnquiryStatus, { type: NotificationType; title: string; body: string }>> = {
  IN_PROGRESS: {
    type: "CONTACT_ENQUIRY_IN_PROGRESS",
    title: "Your enquiry is being reviewed",
    body: "Your enquiry is now being reviewed by our team.",
  },
  WAITING_FOR_USER: {
    type: "CONTACT_ENQUIRY_WAITING_FOR_USER",
    title: "We need a bit more information",
    body: "We need some more information from you to continue with your enquiry. Please check your message below or reply to us.",
  },
  RESOLVED: {
    type: "CONTACT_ENQUIRY_RESOLVED",
    title: "Your enquiry has been resolved",
    body: "Your enquiry has been resolved. Thank you for reaching out to NoDalalTalks.",
  },
  CLOSED: {
    type: "CONTACT_ENQUIRY_CLOSED",
    title: "Your enquiry has been closed",
    body: "Your enquiry has been closed.",
  },
};

/**
 * The full set of history entries shown on the enquiry detail page's
 * Activity panel -- backed by the same generic AuditLog + getAuditHistory
 * already powering Report's history view (lib/actions/reports.ts), not a
 * new model. Status changes, internal notes, and responses are all written
 * here as separate immutable entries -- nothing is ever overwritten.
 */
export async function getEnquiryHistoryAction(enquiryId: string) {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "support.manage_enquiries"))) {
    throw new Error("You don't have permission to do this.");
  }
  return getAuditHistory("ContactEnquiry", enquiryId);
}

const statusSchema = z.object({
  status: z.enum(["NEW", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED"]),
});

/**
 * Changes the enquiry's current status. Unlike the old single-field
 * updateContactEnquiryAction, this never overwrites history -- the
 * transition itself becomes an AuditLog entry, and (for user-visible
 * statuses) triggers a Notification with user-safe copy only. Internal
 * notes are handled by addInternalNoteAction below, kept entirely separate
 * so they can never leak into notification bodies.
 */
export async function changeEnquiryStatusAction(
  enquiryId: string,
  _prevState: ContactEnquiryFormState,
  formData: FormData
): Promise<ContactEnquiryFormState> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "support.manage_enquiries"))) {
    return { error: "You don't have permission to do this." };
  }
  const parsed = statusSchema.safeParse({ status: formData.get("status") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid status" };

  try {
    const existing = await prisma.contactEnquiry.findUnique({ where: { id: enquiryId }, select: { status: true, publicUserId: true } });
    if (!existing) return { error: "Enquiry not found — it may have been deleted." };
    const previousStatus = existing.status;
    if (previousStatus === parsed.data.status) return { success: "No change." };

    await prisma.contactEnquiry.update({ where: { id: enquiryId }, data: { status: parsed.data.status } });
    await logAudit(session.userId, "contact_enquiry.status_change", "ContactEnquiry", enquiryId, {
      before: { status: previousStatus },
      after: { status: parsed.data.status },
    });

    const copy = STATUS_NOTIFICATION_COPY[parsed.data.status];
    if (copy && existing.publicUserId) {
      await createNotification({
        type: copy.type,
        title: copy.title,
        body: copy.body,
        recipientPublicUserId: existing.publicUserId,
        entityType: "ContactEnquiry",
        entityId: enquiryId,
      });
    }
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath("/admin/contact-enquiries");
  revalidatePath(`/admin/contact-enquiries/${enquiryId}`);
  return { success: "Status updated." };
}

const noteSchema = z.object({ note: z.string().trim().min(1, "Note cannot be empty").max(2000) });

/** Internal-only -- never reaches the user, never touches Notification. */
export async function addInternalNoteAction(
  enquiryId: string,
  _prevState: ContactEnquiryFormState,
  formData: FormData
): Promise<ContactEnquiryFormState> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "support.manage_enquiries"))) {
    return { error: "You don't have permission to do this." };
  }
  const parsed = noteSchema.safeParse({ note: formData.get("note") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid note" };

  try {
    const existing = await prisma.contactEnquiry.findUnique({ where: { id: enquiryId }, select: { id: true } });
    if (!existing) return { error: "Enquiry not found — it may have been deleted." };
    await logAudit(session.userId, "contact_enquiry.internal_note", "ContactEnquiry", enquiryId, { after: { note: parsed.data.note } });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath(`/admin/contact-enquiries/${enquiryId}`);
  return { success: "Note added." };
}

const responseSchema = z.object({ message: z.string().trim().min(1, "Response cannot be empty").max(4000) });

/**
 * Records the founder/employee's response and delivers it to the user as an
 * in-app Notification (the existing, working, no-refresh-needed delivery
 * path via NotificationBell). There is no outbound "reply by email" path in
 * this codebase today -- the only email infrastructure on the contact flow
 * is the one-way admin-alert email in lib/email.ts -- so this intentionally
 * does not fabricate one; it reuses what already works end-to-end.
 */
export async function recordResponseAction(
  enquiryId: string,
  _prevState: ContactEnquiryFormState,
  formData: FormData
): Promise<ContactEnquiryFormState> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "support.manage_enquiries"))) {
    return { error: "You don't have permission to do this." };
  }
  const parsed = responseSchema.safeParse({ message: formData.get("message") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid response" };

  let notified = false;
  try {
    const existing = await prisma.contactEnquiry.findUnique({ where: { id: enquiryId }, select: { publicUserId: true } });
    if (!existing) return { error: "Enquiry not found — it may have been deleted." };
    await logAudit(session.userId, "contact_enquiry.response", "ContactEnquiry", enquiryId, { after: { message: parsed.data.message } });

    if (existing.publicUserId) {
      await createNotification({
        type: "CONTACT_ENQUIRY_RESPONSE",
        title: "We've responded to your enquiry",
        body: parsed.data.message,
        recipientPublicUserId: existing.publicUserId,
        entityType: "ContactEnquiry",
        entityId: enquiryId,
      });
      notified = true;
    }
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath(`/admin/contact-enquiries/${enquiryId}`);
  return {
    success: notified
      ? "Response recorded and sent to the user."
      : "Response recorded. The sender wasn't signed in, so no in-app notification could be delivered.",
  };
}

/** Reopens a RESOLVED/CLOSED enquiry back to IN_PROGRESS. */
export async function reopenEnquiryAction(enquiryId: string): Promise<ContactEnquiryFormState> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "support.manage_enquiries"))) {
    return { error: "You don't have permission to do this." };
  }
  try {
    const existing = await prisma.contactEnquiry.findUnique({ where: { id: enquiryId }, select: { status: true, publicUserId: true } });
    if (!existing) return { error: "Enquiry not found — it may have been deleted." };
    if (existing.status !== "RESOLVED" && existing.status !== "CLOSED") return { error: "Only resolved or closed enquiries can be reopened." };

    await prisma.contactEnquiry.update({ where: { id: enquiryId }, data: { status: "IN_PROGRESS" } });
    await logAudit(session.userId, "contact_enquiry.reopen", "ContactEnquiry", enquiryId, {
      before: { status: existing.status },
      after: { status: "IN_PROGRESS" },
    });

    if (existing.publicUserId) {
      await createNotification({
        type: "CONTACT_ENQUIRY_REOPENED",
        title: "Your enquiry has been reopened",
        body: "We've reopened your enquiry and are looking into it further.",
        recipientPublicUserId: existing.publicUserId,
        entityType: "ContactEnquiry",
        entityId: enquiryId,
      });
    }
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath("/admin/contact-enquiries");
  revalidatePath(`/admin/contact-enquiries/${enquiryId}`);
  return { success: "Reopened." };
}

// ─────────────────────────────────────────────────────────────────────────
// Trash (Section 15) — same soft-delete → Trash → restore → permanent-delete
// shape already proven for Project/Builder/Locality/Transaction
// (lib/actions/projects.ts etc.), applied here for ContactEnquiry.
// ─────────────────────────────────────────────────────────────────────────

export async function trashEnquiryAction(enquiryId: string): Promise<{ error?: string }> {
  const session = await requireAdminSession();
  const existing = await prisma.contactEnquiry.findUnique({ where: { id: enquiryId }, select: { id: true } });
  if (!existing) return { error: "Enquiry not found" };

  await prisma.contactEnquiry.update({ where: { id: enquiryId }, data: { deletedAt: new Date(), deletedByUserId: session.userId } });
  await logAudit(session.userId, "contact_enquiry.trash", "ContactEnquiry", enquiryId);
  revalidatePath("/admin/contact-enquiries");
  return {};
}

export async function restoreEnquiryAction(enquiryId: string): Promise<{ error?: string }> {
  const session = await requireAdminSession();
  const existing = await prisma.contactEnquiry.findUnique({ where: { id: enquiryId }, select: { deletedAt: true } });
  if (!existing) return { error: "Enquiry not found" };
  if (!existing.deletedAt) return { error: "This enquiry isn't in Trash" };

  await prisma.contactEnquiry.update({ where: { id: enquiryId }, data: { deletedAt: null, deletedByUserId: null } });
  await logAudit(session.userId, "contact_enquiry.restore", "ContactEnquiry", enquiryId);
  revalidatePath("/admin/trash");
  revalidatePath("/admin/contact-enquiries");
  return {};
}

/** Irreversible — gated behind Trash re-authentication (Section 19), on top of the ADMIN-only session check every other permanent delete already requires. */
export async function permanentlyDeleteEnquiryAction(enquiryId: string): Promise<{ error?: string }> {
  const session = await requireAdminSession();
  try {
    await requireTrashReauth(session.userId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Re-authentication required" };
  }

  const existing = await prisma.contactEnquiry.findUnique({ where: { id: enquiryId }, select: { deletedAt: true, name: true, email: true } });
  if (!existing) return { error: "Enquiry not found" };
  if (!existing.deletedAt) return { error: "Move this enquiry to Trash before permanently deleting it" };

  await logAudit(session.userId, "contact_enquiry.permanent-delete", "ContactEnquiry", enquiryId, {
    before: { name: existing.name, email: existing.email },
  });
  await prisma.contactEnquiry.delete({ where: { id: enquiryId } });
  revalidatePath("/admin/trash");
  return {};
}

export async function bulkEnquiryTrashAction(
  enquiryIds: string[],
  operation: "restore" | "permanent-delete"
): Promise<{ error?: string; affected?: number }> {
  const session = await requireAdminSession();
  if (enquiryIds.length === 0) return { error: "No enquiries selected" };
  if (operation === "permanent-delete") {
    try {
      await requireTrashReauth(session.userId);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Re-authentication required" };
    }
  }

  const trashed = await prisma.contactEnquiry.findMany({ where: { id: { in: enquiryIds }, deletedAt: { not: null } }, select: { id: true } });
  let affected = 0;
  if (operation === "restore") {
    for (const e of trashed) {
      await prisma.contactEnquiry.update({ where: { id: e.id }, data: { deletedAt: null, deletedByUserId: null } });
    }
    affected = trashed.length;
  } else {
    for (const e of trashed) {
      await prisma.contactEnquiry.delete({ where: { id: e.id } });
    }
    affected = trashed.length;
  }

  await logAudit(session.userId, `contact_enquiry.bulk.${operation}`, "ContactEnquiry", enquiryIds.join(","));
  revalidatePath("/admin/trash");
  revalidatePath("/admin/contact-enquiries");
  return { affected };
}

export async function emptyEnquiryTrashAction(): Promise<{ error?: string; affected?: number }> {
  const session = await requireAdminSession();
  try {
    await requireTrashReauth(session.userId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Re-authentication required" };
  }

  const trashed = await prisma.contactEnquiry.findMany({ where: { deletedAt: { not: null } }, select: { id: true } });
  for (const e of trashed) {
    await prisma.contactEnquiry.delete({ where: { id: e.id } });
  }
  await logAudit(session.userId, "contact_enquiry.trash.empty", "ContactEnquiry", "bulk");
  revalidatePath("/admin/trash");
  return { affected: trashed.length };
}
