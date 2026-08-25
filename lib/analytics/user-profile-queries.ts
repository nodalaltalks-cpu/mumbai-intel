import "server-only";
import type { ResearchEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCompletionSections, type CompletionSectionStatus, type ProfileSectionKey } from "@/lib/profile-completion";

const PROFILE_COMPLETION_EVENT_TYPES: ResearchEventType[] = [
  "PROFILE_VIEWED",
  "PROFILE_UPDATED",
  "PROFILE_COMPLETED",
  "PROFILE_STARTED",
  "PROFILE_FIELD_VIEWED",
  "PROFILE_FIELD_COMPLETED",
  "PROFILE_FIELD_SKIPPED",
  "PROFILE_SECTION_COMPLETED",
  "PROFILE_COMPLETION_25",
  "PROFILE_COMPLETION_50",
  "PROFILE_COMPLETION_75",
  "PROFILE_COMPLETION_90",
  "PROFILE_COMPLETION_ABANDONED",
];

async function safeQuery<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[user-profile-queries] ${label} failed:`, error);
    return fallback;
  }
}

export interface PublicUserProfileDetail {
  overview: {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    phoneVerified: boolean;
    emailVerified: boolean;
    createdAt: Date;
    lastActiveAt: Date | null;
    profileCompletionPercent: number;
  };
  personal: {
    dateOfBirth: Date | null;
    gender: string | null;
    city: string | null;
    currentLocality: string | null;
    familySize: string | null;
    familyIncomeRange: string | null;
  };
  preferences: {
    budgetMinRupees: number | null;
    budgetMaxRupees: number | null;
    categories: string[];
    configurations: string[];
    localityNames: string[];
    localityFreeText: string[];
    readiness: string[];
    purposes: string[];
  };
  activity: {
    searchesRun: number;
    projectsViewed: number;
    projectsSaved: number;
    savedSearches: number;
    reportsSubmitted: number;
    contactEnquiries: number;
    notificationsReceived: number;
    notificationsClicked: number;
    profileCompletionEvents: number;
  };
  completionSections: CompletionSectionStatus[];
  /** Field keys the user has explicitly skipped (PROFILE_FIELD_SKIPPED) and still hasn't completed since -- lets the admin page show "— Skipped" as a third state distinct from "○ Incomplete" (Section 20). A field that was skipped and later filled in is "✓ Completed", not "— Skipped". */
  skippedFieldKeys: string[];
  /** Most recent ADMIN_PROFILE_REMINDER_SENT event, if any -- for "last reminded" + the after-reminder outcome check on the page. */
  lastReminder: { sentAt: Date; completionPercentAtSend: number | null } | null;
  completionIncreasedSinceLastReminder: boolean;
  /** Per-section reminder history (Section 29) -- same ADMIN_PROFILE_REMINDER_SENT event log, grouped by metadata.section, so the founder sees "reminded 2x, last on <date>" before sending another one for that specific section and doesn't accidentally spam. */
  sectionReminders: Partial<Record<ProfileSectionKey, { lastSentAt: Date; sentCount: number }>>;
}

const EMPTY_ACTIVITY = {
  searchesRun: 0,
  projectsViewed: 0,
  projectsSaved: 0,
  savedSearches: 0,
  reportsSubmitted: 0,
  contactEnquiries: 0,
  notificationsReceived: 0,
  notificationsClicked: 0,
  profileCompletionEvents: 0,
};

/**
 * The single real-data bundle behind the admin per-user profile detail page
 * (Section 8) -- every number here comes from a real table/count, never a
 * fabricated or estimated figure. Returns null only if the user genuinely
 * doesn't exist (deleted between list and detail view).
 */
export async function getPublicUserProfileDetail(publicUserId: string): Promise<PublicUserProfileDetail | null> {
  return safeQuery("getPublicUserProfileDetail", null, async () => {
    const user = await prisma.publicUser.findUnique({
      where: { id: publicUserId },
      include: { preferences: true },
    });
    if (!user) return null;

    const [
      lastActive,
      searchesRun,
      projectsViewed,
      projectsSaved,
      savedSearches,
      reportsSubmitted,
      contactEnquiries,
      notificationsReceived,
      notificationsClicked,
      profileCompletionEvents,
      localities,
      lastReminderEvent,
      fieldSkippedEvents,
    ] = await Promise.all([
      prisma.researchEvent.findFirst({ where: { publicUserId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      prisma.searchHistory.count({ where: { publicUserId } }),
      prisma.recentView.count({ where: { publicUserId, entityType: "Project" } }),
      prisma.savedProject.count({ where: { publicUserId } }),
      prisma.savedSearch.count({ where: { publicUserId } }),
      prisma.report.count({ where: { reporterUserId: publicUserId } }),
      prisma.contactEnquiry.count({ where: { publicUserId } }),
      prisma.notification.count({ where: { recipientPublicUserId: publicUserId } }),
      prisma.notification.count({ where: { recipientPublicUserId: publicUserId, clickedAt: { not: null } } }),
      prisma.researchEvent.count({ where: { publicUserId, eventType: { in: PROFILE_COMPLETION_EVENT_TYPES } } }),
      user.preferences?.preferredLocalityIds.length
        ? prisma.locality.findMany({ where: { id: { in: user.preferences.preferredLocalityIds } }, select: { name: true } })
        : Promise.resolve([]),
      prisma.researchEvent.findFirst({
        where: { eventType: "ADMIN_PROFILE_REMINDER_SENT", entityType: "PublicUser", entityId: publicUserId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, metadata: true },
      }),
      prisma.researchEvent.findMany({
        where: { eventType: "PROFILE_FIELD_SKIPPED", entityType: "PublicUser", entityId: publicUserId },
        select: { metadata: true },
      }),
    ]);

    const allReminderEvents = await prisma.researchEvent.findMany({
      where: { eventType: "ADMIN_PROFILE_REMINDER_SENT", entityType: "PublicUser", entityId: publicUserId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, metadata: true },
    });
    const sectionReminders: Partial<Record<ProfileSectionKey, { lastSentAt: Date; sentCount: number }>> = {};
    for (const event of allReminderEvents) {
      const section = (event.metadata as { section?: ProfileSectionKey } | null)?.section;
      if (!section) continue; // the overall (non-section-scoped) reminder -- already covered by lastReminder above
      const existing = sectionReminders[section];
      sectionReminders[section] = existing
        ? { lastSentAt: existing.lastSentAt, sentCount: existing.sentCount + 1 }
        : { lastSentAt: event.createdAt, sentCount: 1 };
    }

    const completionIncreasedSinceLastReminder = lastReminderEvent
      ? (await prisma.researchEvent.count({
          where: { eventType: "PROFILE_COMPLETION_AFTER_REMINDER", entityType: "PublicUser", entityId: publicUserId, createdAt: { gte: lastReminderEvent.createdAt } },
        })) > 0
      : false;

    const completionSections = getCompletionSections({
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
    });

    const skippedKeysEverSeen = new Set(
      fieldSkippedEvents.map((e) => (e.metadata as { field?: string } | null)?.field).filter((k): k is string => Boolean(k))
    );
    const completeKeys = new Set(completionSections.filter((s) => s.complete).map((s) => s.key));
    const skippedFieldKeys = [...skippedKeysEverSeen].filter((k) => !completeKeys.has(k));

    const reminderMetadata = lastReminderEvent?.metadata as { completionPercent?: number } | null;

    return {
      overview: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        phoneVerified: user.phoneVerifiedAt !== null,
        emailVerified: user.emailVerifiedAt !== null,
        createdAt: user.createdAt,
        lastActiveAt: lastActive?.createdAt ?? null,
        profileCompletionPercent: user.profileCompletionPercent,
      },
      personal: {
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        city: user.city,
        currentLocality: user.currentLocality,
        familySize: user.preferences?.familySize ?? null,
        familyIncomeRange: user.preferences?.familyIncomeRange ?? null,
      },
      preferences: {
        budgetMinRupees: user.preferences?.preferredBudgetMinRupees ?? null,
        budgetMaxRupees: user.preferences?.preferredBudgetMaxRupees ?? null,
        categories: user.preferences?.preferredCategories ?? [],
        configurations: user.preferences?.preferredConfigurations ?? [],
        localityNames: localities.map((l) => l.name),
        localityFreeText: user.preferences?.localityFreeText ?? [],
        readiness: user.preferences?.preferredReadiness ?? [],
        purposes: user.preferences?.purposes ?? [],
      },
      activity: {
        searchesRun,
        projectsViewed,
        projectsSaved,
        savedSearches,
        reportsSubmitted,
        contactEnquiries,
        notificationsReceived,
        notificationsClicked,
        profileCompletionEvents,
      },
      completionSections,
      skippedFieldKeys,
      lastReminder: lastReminderEvent ? { sentAt: lastReminderEvent.createdAt, completionPercentAtSend: reminderMetadata?.completionPercent ?? null } : null,
      completionIncreasedSinceLastReminder,
      sectionReminders,
    };
  });
}

/** "Complete family income and configuration" -- the admin page's plain-English summary of what's left, reusing the same completion checklist the reminder message itself is built from. */
export function nextBestActionText(sections: CompletionSectionStatus[]): string | null {
  const missing = sections.filter((s) => !s.complete);
  if (missing.length === 0) return null;
  const phrases = missing.slice(0, 3).map((m) => m.label.charAt(0).toLowerCase() + m.label.slice(1));
  const more = missing.length > 3 ? ` (+${missing.length - 3} more)` : "";
  if (phrases.length === 1) return `Complete ${phrases[0]}${more}`;
  return `Complete ${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}${more}`;
}
