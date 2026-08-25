"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMutateSession } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { getCompletionSections, PROFILE_SECTION_LABELS, type ProfileCompletionInput, type ProfileSectionKey } from "@/lib/profile-completion";
import { createNotification } from "@/lib/notifications";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import { logAudit } from "@/lib/audit";

/** "Budget range" -> "budget range" -- lowercases the shared completion-checklist labels for use mid-sentence, so the reminder copy never maintains a second parallel field-name list that could drift from lib/profile-completion-shared.ts. */
function toMidSentence(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

function toNaturalList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export interface ProfileReminderPreview {
  title: string;
  body: string;
  missingFieldKeys: string[];
  completionPercent: number;
}

async function loadCompletionInput(publicUserId: string): Promise<{ input: ProfileCompletionInput; percent: number } | null> {
  const user = await prisma.publicUser.findUnique({
    where: { id: publicUserId },
    select: {
      name: true,
      phone: true,
      dateOfBirth: true,
      gender: true,
      emailVerifiedAt: true,
      profileCompletionPercent: true,
      preferences: {
        select: {
          preferredBudgetMinRupees: true,
          preferredBudgetMaxRupees: true,
          preferredLocalityIds: true,
          localityFreeText: true,
          preferredCategories: true,
          preferredConfigurations: true,
          preferredReadiness: true,
          purposes: true,
          familySize: true,
          familyIncomeRange: true,
        },
      },
    },
  });
  if (!user) return null;
  return {
    percent: user.profileCompletionPercent,
    input: {
      name: user.name,
      phone: user.phone,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      emailVerified: user.emailVerifiedAt !== null,
      preferredBudgetMinRupees: user.preferences?.preferredBudgetMinRupees ?? null,
      preferredBudgetMaxRupees: user.preferences?.preferredBudgetMaxRupees ?? null,
      preferredLocalityIds: user.preferences?.preferredLocalityIds ?? [],
      localityFreeText: user.preferences?.localityFreeText ?? [],
      preferredCategories: user.preferences?.preferredCategories ?? [],
      preferredConfigurations: user.preferences?.preferredConfigurations ?? [],
      preferredReadiness: user.preferences?.preferredReadiness ?? [],
      purposes: user.preferences?.purposes ?? [],
      familySize: user.preferences?.familySize ?? null,
      familyIncomeRange: user.preferences?.familyIncomeRange ?? null,
    },
  };
}

/**
 * Builds the personalized reminder message from the user's real, current
 * incomplete fields — never hand-written per send (Part 9). Shared by the
 * preview (read-only) and the actual send action below, so what the founder
 * previews is exactly what goes out.
 */
export async function previewProfileReminderAction(publicUserId: string): Promise<ProfileReminderPreview | { error: string }> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "users.manage_notifications"))) {
    return { error: "You don't have permission to do this." };
  }

  const loaded = await loadCompletionInput(publicUserId);
  if (!loaded) return { error: "User not found." };

  const missing = getCompletionSections(loaded.input).filter((s) => !s.complete);
  if (missing.length === 0) return { error: "This user's research profile is already 100% complete." };

  const phrases = missing.map((m) => toMidSentence(m.label));
  const list = toNaturalList(phrases);
  const opener = loaded.percent >= 75 ? "You're almost there! " : "";
  const body = `${opener}Your research profile is ${loaded.percent}% complete. Add your ${list} to help us make your property research more relevant.`;

  return {
    title: "Complete your research profile",
    body,
    missingFieldKeys: missing.map((m) => m.key),
    completionPercent: loaded.percent,
  };
}

/** Sends the previewed reminder for real — regenerates the message server-side rather than trusting a client-echoed copy, so it can never drift from the user's actual current state between preview and send. */
export async function sendProfileReminderAction(publicUserId: string): Promise<{ error?: string; success?: string }> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "users.manage_notifications"))) {
    return { error: "You don't have permission to do this." };
  }

  const preview = await previewProfileReminderAction(publicUserId);
  if ("error" in preview) return preview;

  await createNotification({
    type: "PROFILE_COMPLETION_REMINDER",
    title: preview.title,
    body: preview.body,
    recipientPublicUserId: publicUserId,
    entityType: "PublicUser",
    entityId: publicUserId,
    actionLabel: "Complete profile",
    actionUrl: "/account?tab=profile&guide=1",
  });

  await recordResearchEvent("ADMIN_PROFILE_REMINDER_SENT", {
    entityType: "PublicUser",
    entityId: publicUserId,
    metadata: { completionPercent: preview.completionPercent, missingFieldKeys: preview.missingFieldKeys },
  });
  await logAudit(session.userId, "profile_reminder.send", "PublicUser", publicUserId);

  revalidatePath(`/admin/analytics/registered-users/${publicUserId}`);
  return { success: "Reminder sent." };
}

/**
 * Section-scoped reminder (Part 28) -- same machinery as the overall
 * reminder above (real missing fields, server-regenerated on send, same
 * PROFILE_COMPLETION_REMINDER notification type), just filtered to one
 * section's fields instead of the whole profile. Reuses the existing
 * ADMIN_PROFILE_REMINDER_SENT event type with `section` added to its
 * metadata, rather than a second parallel event type for the same signal.
 */
export async function previewSectionReminderAction(publicUserId: string, section: ProfileSectionKey): Promise<ProfileReminderPreview | { error: string }> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "users.manage_notifications"))) {
    return { error: "You don't have permission to do this." };
  }

  const loaded = await loadCompletionInput(publicUserId);
  if (!loaded) return { error: "User not found." };

  const missing = getCompletionSections(loaded.input).filter((s) => !s.complete && s.section === section);
  if (missing.length === 0) return { error: `${PROFILE_SECTION_LABELS[section]} is already complete for this user.` };

  const phrases = missing.map((m) => toMidSentence(m.label));
  const list = toNaturalList(phrases);
  const opener = loaded.percent >= 75 ? "You're almost there! " : "";
  const body = `${opener}Your research profile is ${loaded.percent}% complete. Add your ${list} to help us make your property research more relevant.`;

  return {
    title: "Complete your research profile",
    body,
    missingFieldKeys: missing.map((m) => m.key),
    completionPercent: loaded.percent,
  };
}

export async function sendSectionReminderAction(publicUserId: string, section: ProfileSectionKey): Promise<{ error?: string; success?: string }> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "users.manage_notifications"))) {
    return { error: "You don't have permission to do this." };
  }

  const preview = await previewSectionReminderAction(publicUserId, section);
  if ("error" in preview) return preview;

  // Part 5 — deep-link to the specific section (and, when there's exactly
  // one missing field, that exact field) rather than always the same
  // generic "top of the guided flow" URL. Consumed by the `section`/`field`
  // params in lib/profile-completion-client.tsx's guide-param effect.
  const deepLinkParams = new URLSearchParams({ tab: "profile", guide: "1", section });
  if (preview.missingFieldKeys.length === 1) deepLinkParams.set("field", preview.missingFieldKeys[0]);

  await createNotification({
    type: "PROFILE_COMPLETION_REMINDER",
    title: preview.title,
    body: preview.body,
    recipientPublicUserId: publicUserId,
    entityType: "PublicUser",
    entityId: publicUserId,
    actionLabel: "Complete profile",
    actionUrl: `/account?${deepLinkParams.toString()}`,
  });

  await recordResearchEvent("ADMIN_PROFILE_REMINDER_SENT", {
    entityType: "PublicUser",
    entityId: publicUserId,
    metadata: { section, completionPercent: preview.completionPercent, missingFieldKeys: preview.missingFieldKeys },
  });
  await logAudit(session.userId, "profile_reminder.send_section", "PublicUser", publicUserId, { after: { section } });

  revalidatePath(`/admin/analytics/registered-users/${publicUserId}`);
  return { success: `Reminder sent for ${PROFILE_SECTION_LABELS[section]}.` };
}
