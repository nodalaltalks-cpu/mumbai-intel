"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { friendlyPrismaError } from "./errors";

const emptyToUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);

export const PAYMENT_MILESTONE_PRESETS = ["Booking", "Agreement", "Plinth", "Slab Completion", "Possession"] as const;

const milestoneSchema = z.object({
  label: z.string().trim().min(1, "Label is required"),
  percentage: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(100).optional()),
  amountRupees: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
});

export interface PaymentMilestoneActionState {
  error?: string;
}

function toPaise(rupees: number | undefined): bigint | null {
  if (rupees === undefined) return null;
  return BigInt(Math.round(rupees * 100));
}

export async function addPaymentMilestoneAction(
  projectId: string,
  _prevState: PaymentMilestoneActionState,
  formData: FormData
): Promise<PaymentMilestoneActionState> {
  await requireMutateSession();

  const parsed = milestoneSchema.safeParse({
    label: formData.get("label"),
    percentage: formData.get("percentage"),
    amountRupees: formData.get("amountRupees"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  const maxSort = await prisma.projectPaymentMilestone.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });

  try {
    await prisma.projectPaymentMilestone.create({
      data: {
        projectId,
        label: data.label,
        percentage: data.percentage ?? null,
        amountPaise: toPaise(data.amountRupees),
        isCustom: !(PAYMENT_MILESTONE_PRESETS as readonly string[]).includes(data.label),
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath(`/admin/projects/${projectId}/edit`);
  return {};
}

export async function updatePaymentMilestoneAction(
  milestoneId: string,
  projectId: string,
  _prevState: PaymentMilestoneActionState,
  formData: FormData
): Promise<PaymentMilestoneActionState> {
  await requireMutateSession();

  const parsed = milestoneSchema.safeParse({
    label: formData.get("label"),
    percentage: formData.get("percentage"),
    amountRupees: formData.get("amountRupees"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  try {
    await prisma.projectPaymentMilestone.update({
      where: { id: milestoneId },
      data: {
        label: data.label,
        percentage: data.percentage ?? null,
        amountPaise: toPaise(data.amountRupees),
        isCustom: !(PAYMENT_MILESTONE_PRESETS as readonly string[]).includes(data.label),
      },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath(`/admin/projects/${projectId}/edit`);
  return {};
}

export async function deletePaymentMilestoneAction(milestoneId: string): Promise<{ error?: string }> {
  await requireMutateSession();
  const milestone = await prisma.projectPaymentMilestone.delete({ where: { id: milestoneId } });
  revalidatePath(`/admin/projects/${milestone.projectId}/edit`);
  return {};
}
