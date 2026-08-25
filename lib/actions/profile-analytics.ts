"use server";

import { getPublicSession } from "@/lib/public-auth/session";
import { recordResearchEvent } from "@/lib/analytics/research-events";

/**
 * Fired once when the founder-requested "guided completion" flow is entered
 * (Complete My Profile / Complete Next). `alreadyInProgress` (true when the
 * visitor already had >0% complete) distinguishes a returning user picking
 * back up (PROFILE_COMPLETION_RESUMED) from a first-time entry
 * (PROFILE_STARTED) -- same guided-flow entry, different founder-relevant
 * signal, so this stays one action rather than two near-identical ones.
 */
export async function recordProfileStartedAction(alreadyInProgress = false): Promise<void> {
  const session = await getPublicSession();
  if (!session) return;
  await recordResearchEvent(alreadyInProgress ? "PROFILE_COMPLETION_RESUMED" : "PROFILE_STARTED", {
    entityType: "PublicUser",
    entityId: session.userId,
  });
}

/** Fired when the user explicitly skips a field during guided completion — a real "chose not to fill this" signal, distinct from PROFILE_FIELD_COMPLETED. */
export async function recordFieldSkippedAction(field: string): Promise<void> {
  const session = await getPublicSession();
  if (!session) return;
  await recordResearchEvent("PROFILE_FIELD_SKIPPED", { entityType: "PublicUser", entityId: session.userId, metadata: { field } });
}

/**
 * Fired whenever the guided flow navigates somewhere -- a section/field row
 * clicked, the "Complete my profile" CTA clicked (wherever it appears), or
 * the automatic next-field advance. `trigger` distinguishes a user click from
 * a system-driven auto-advance rather than adding a separate event type for
 * what is the same underlying signal (Section 19: real decision value, not
 * volume for its own sake). Never carries a field's actual value -- only
 * section/field identifiers.
 */
export async function recordSectionClickedAction(input: { section?: string; field?: string; trigger: "click" | "cta" | "auto_advance"; source?: string }): Promise<void> {
  const session = await getPublicSession();
  if (!session) return;
  await recordResearchEvent("PROFILE_SECTION_CLICKED", {
    entityType: "PublicUser",
    entityId: session.userId,
    metadata: { section: input.section, field: input.field, trigger: input.trigger, source: input.source },
  });
}
