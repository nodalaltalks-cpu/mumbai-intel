"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/guard";
import { logAudit } from "@/lib/audit";
import { setCapacityBaseline, type CapacityConfidence } from "@/lib/platform-metrics/capacity-baseline";

export interface CapacityBaselineActionState {
  error?: string;
  success?: boolean;
}

const schema = z.object({
  highestTestedConcurrency: z.coerce.number().int().positive(),
  testedAt: z.string().min(1),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  notes: z.string().max(500).optional().default(""),
});

/** Part I — Founder-editable capacity baseline (ADMIN only, same infrastructure-control gate as Platform Health itself). Lets a future re-test update the recorded baseline without a code change. */
export async function updateCapacityBaselineAction(_prevState: CapacityBaselineActionState, formData: FormData): Promise<CapacityBaselineActionState> {
  const session = await requireAdminSession();

  const parsed = schema.safeParse({
    highestTestedConcurrency: formData.get("highestTestedConcurrency"),
    testedAt: formData.get("testedAt"),
    confidence: formData.get("confidence"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  await setCapacityBaseline({
    highestTestedConcurrency: parsed.data.highestTestedConcurrency,
    testedAt: new Date(parsed.data.testedAt),
    confidence: parsed.data.confidence as CapacityConfidence,
    notes: parsed.data.notes,
  });
  await logAudit(session.userId, "platform-health.capacity-baseline.update", "SiteSetting", "capacity_baseline", { after: parsed.data });
  revalidatePath("/admin/platform-health");
  return { success: true };
}
