"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { USER_ROLES } from "@/lib/project-meta";
import { logAudit } from "@/lib/audit";
import { friendlyPrismaError } from "./errors";

const emptyToUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);

export interface UserFormState {
  error?: string;
}

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  name: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(USER_ROLES),
});

export async function createUserAction(_prevState: UserFormState, formData: FormData): Promise<UserFormState> {
  const session = await requireAdminSession();

  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  const passwordHash = await hashPassword(data.password);

  let userId: string;
  try {
    const created = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name ?? null,
        passwordHash,
        role: data.role,
      },
      select: { id: true },
    });
    userId = created.id;
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  await logAudit(session.userId, "user.create", "User", userId);
  revalidatePath("/admin/users");
  redirect("/admin/users?created=1");
}

const updateUserSchema = z.object({
  name: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  role: z.enum(USER_ROLES),
  isActive: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  newPassword: z.preprocess(emptyToUndefined, z.string().min(8, "Password must be at least 8 characters").optional()),
});

export async function updateUserAction(
  userId: string,
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const session = await requireAdminSession();

  const parsed = updateUserSchema.safeParse({
    name: formData.get("name"),
    role: formData.get("role"),
    isActive: formData.get("isActive"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  if (userId === session.userId && (data.role !== "ADMIN" || !data.isActive)) {
    return { error: "You cannot demote or deactivate your own account." };
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name ?? null,
        role: data.role,
        isActive: data.isActive,
        ...(data.newPassword ? { passwordHash: await hashPassword(data.newPassword) } : {}),
      },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  await logAudit(session.userId, "user.update", "User", userId);
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}/edit`);
  redirect("/admin/users?saved=1");
}

export async function deleteUserAction(userId: string): Promise<{ error?: string }> {
  const session = await requireAdminSession();
  if (userId === session.userId) return { error: "You cannot delete your own account." };

  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  await logAudit(session.userId, "user.delete", "User", userId);
  revalidatePath("/admin/users");
  return {};
}
