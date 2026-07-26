"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { INFRA_TYPES } from "@/lib/project-meta";
import { friendlyPrismaError } from "./errors";

const infraAssetSchema = z.object({
  type: z.enum(INFRA_TYPES),
  name: z.string().trim().min(1, "Name is required"),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

export interface InfraAssetActionState {
  error?: string;
}

/**
 * Catalogues a new InfraAsset with coordinates, scoped to the primary city.
 * Localities compute "nearby infrastructure" automatically from centroid
 * proximity (see getLocalityNearbyInfra) — cataloguing an asset here is
 * enough for it to show up on every locality/project within range, no
 * separate per-locality linking step needed.
 */
export async function createInfraAssetAction(
  cityId: string,
  _prevState: InfraAssetActionState,
  formData: FormData
): Promise<InfraAssetActionState> {
  await requireMutateSession();

  const parsed = infraAssetSchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await prisma.infraAsset.create({
      data: {
        cityId,
        type: parsed.data.type,
        name: parsed.data.name,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath("/admin/localities");
  return {};
}
