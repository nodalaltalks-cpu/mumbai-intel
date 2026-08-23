"use server";

import { getPublicSession } from "@/lib/public-auth/session";
import { recordResearchEvent } from "@/lib/analytics/research-events";

/** Fired once when the founder-requested "guided completion" flow is entered (Complete My Profile / Complete Next). Field key only in metadata, never a value. */
export async function recordProfileStartedAction(): Promise<void> {
  const session = await getPublicSession();
  if (!session) return;
  await recordResearchEvent("PROFILE_STARTED", { entityType: "PublicUser", entityId: session.userId });
}

/** Fired when the user explicitly skips a field during guided completion — a real "chose not to fill this" signal, distinct from PROFILE_FIELD_COMPLETED. */
export async function recordFieldSkippedAction(field: string): Promise<void> {
  const session = await getPublicSession();
  if (!session) return;
  await recordResearchEvent("PROFILE_FIELD_SKIPPED", { entityType: "PublicUser", entityId: session.userId, metadata: { field } });
}
