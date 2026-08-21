"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { friendlyPrismaError } from "./errors";
import { applyReportRejection } from "./reports";

/**
 * The employee-change approval queue (Section 7). A non-ADMIN account's
 * sensitive action lands here instead of applying immediately; only an ADMIN
 * approving it makes the change real. `action` is a small closed set of
 * strings this file knows how to actually apply on approval -- adding a new
 * gated action later means adding one case to APPLY_HANDLERS, not a new
 * table or a generic plugin system.
 *
 * Today's only producer is rejectReportAction (lib/actions/reports.ts) when
 * the actor isn't ADMIN. Built as a real, working, extensible pattern rather
 * than inert schema -- see that file for the producer side.
 */
const APPLY_HANDLERS: Record<string, (entityId: string, after: unknown) => Promise<void>> = {
  "report.reject": async (reportId, after) => {
    const remark = (after as { remark?: string } | null)?.remark;
    if (!remark) throw new Error("Missing rejection remark");
    await applyReportRejection(reportId, remark);
  },
};

export interface PendingChangeCreateInput {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

/** Not a Server Action itself (no "use server" export needed at call sites beyond this file) -- called by the producer action (e.g. rejectReportAction) inside its own try/catch. */
export async function createPendingChange(input: PendingChangeCreateInput): Promise<{ id: string }> {
  const created = await prisma.pendingChange.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before === undefined ? undefined : (input.before as object),
      after: input.after === undefined ? undefined : (input.after as object),
    },
    select: { id: true },
  });
  return created;
}

export interface PendingChangeActionState {
  error?: string;
  success?: string;
}

/** ADMIN-only, per "Employees must never approve their own changes / Founder always remains the highest authority" -- there is no path here that lets a PendingChange's own actor approve it. */
export async function approvePendingChangeAction(id: string): Promise<PendingChangeActionState> {
  try {
    const session = await requireAdminSession();
    const change = await prisma.pendingChange.findUnique({ where: { id } });
    if (!change) return { error: "Change not found — it may have already been reviewed." };
    if (change.status !== "PENDING") return { error: "This change has already been reviewed." };

    const handler = APPLY_HANDLERS[change.action];
    if (!handler) return { error: `No handler registered for "${change.action}".` };
    if (!change.entityId) return { error: "Change has no target record." };

    await handler(change.entityId, change.after);

    await prisma.pendingChange.update({
      where: { id },
      data: { status: "APPROVED", reviewedByUserId: session.userId, reviewedAt: new Date() },
    });
    await logAudit(session.userId, "pending_change.approve", change.entityType, change.entityId, { after: change.after });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
  revalidatePath("/admin/approvals");
  revalidatePath("/admin/reports");
  return { success: "Approved and applied." };
}

export async function rejectPendingChangeAction(id: string, reviewNote?: string): Promise<PendingChangeActionState> {
  try {
    const session = await requireAdminSession();
    const change = await prisma.pendingChange.findUnique({ where: { id }, select: { status: true, entityType: true, entityId: true } });
    if (!change) return { error: "Change not found — it may have already been reviewed." };
    if (change.status !== "PENDING") return { error: "This change has already been reviewed." };

    await prisma.pendingChange.update({
      where: { id },
      data: { status: "REJECTED", reviewedByUserId: session.userId, reviewedAt: new Date(), reviewNote: reviewNote ?? null },
    });
    await logAudit(session.userId, "pending_change.reject", change.entityType, change.entityId ?? id);
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
  revalidatePath("/admin/approvals");
  return { success: "Change rejected — it was not applied." };
}
