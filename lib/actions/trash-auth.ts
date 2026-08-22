"use server";

import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/guard";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { grantTrashReauth } from "@/lib/auth/trash-reauth";
import { logAudit } from "@/lib/audit";

export interface TrashReauthState {
  error?: string;
  success?: boolean;
}

const schema = z.object({ password: z.string().min(1, "Enter your password") });

/** Section 18's "require re-authentication / password confirmation" — reuses the founder's existing password hash, never a separate stored credential. */
export async function reauthenticateForTrashAction(_prevState: TrashReauthState, formData: FormData): Promise<TrashReauthState> {
  const session = await requireAdminSession();
  const parsed = schema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return { error: "Account not found" };

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    await logAudit(session.userId, "trash.reauth_failed", "Trash", session.userId);
    return { error: "Incorrect password" };
  }

  await grantTrashReauth(session.userId);
  await logAudit(session.userId, "trash.reauth", "Trash", session.userId);
  return { success: true };
}
