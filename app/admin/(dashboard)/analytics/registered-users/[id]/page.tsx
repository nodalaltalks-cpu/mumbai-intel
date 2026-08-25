import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { getPublicUserProfileDetail, nextBestActionText } from "@/lib/analytics/user-profile-queries";
import { formatDate, formatDateTime, formatRelativeTime } from "@/lib/format";
import { formatIndianPriceCompact } from "@/lib/price-range";
import { CATEGORY_LABEL, CONFIGURATION_FILTER_OPTIONS } from "@/lib/project-meta";
import BackButton from "@/app/admin/components/BackButton";
import ProfileReminderCard from "@/app/admin/components/ProfileReminderCard";
import SectionReminderButton from "@/app/admin/components/SectionReminderButton";

export const metadata: Metadata = { title: "User Profile — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const SPECIAL_CONFIGURATION_LABEL: Record<string, string> = {
  PENTHOUSE: "Penthouse",
  DUPLEX: "Duplex",
  BUNGALOW: "Bungalow",
  PLOT: "Plot",
  LAND: "Land",
};
const CONFIGURATION_LABEL: Record<string, string> = {
  ...Object.fromEntries(CONFIGURATION_FILTER_OPTIONS.map((c) => [c.value, c.label])),
  ...SPECIAL_CONFIGURATION_LABEL,
};
const READINESS_LABEL: Record<string, string> = {
  PRE_LAUNCH: "Pre-launch",
  NEW_LAUNCH: "New Launch",
  UNDER_CONSTRUCTION: "Under Construction",
  NEAR_POSSESSION_6M: "Near Possession",
  READY_TO_MOVE: "Ready to Move",
};
const PURPOSE_LABEL: Record<string, string> = { SELF_USE: "Self Use", INVESTMENT: "Investment", RESEARCHING: "Just Researching" };
const GENDER_LABEL: Record<string, string> = { MALE: "Male", FEMALE: "Female", PREFER_NOT_TO_SAY: "Prefer not to say" };
const FAMILY_SIZE_LABEL: Record<string, string> = { "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6_PLUS": "6+", PREFER_NOT_TO_SAY: "Prefer not to say" };
const FAMILY_INCOME_LABEL: Record<string, string> = {
  BELOW_5L: "Below ₹5 Lakh",
  "5L_10L": "₹5–10 Lakh",
  "10L_20L": "₹10–20 Lakh",
  "20L_50L": "₹20–50 Lakh",
  "50L_1CR": "₹50 Lakh–₹1 Crore",
  "1CR_PLUS": "₹1 Crore+",
  PREFER_NOT_TO_SAY: "Prefer not to say",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-sm border border-border bg-surface p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-1.5 text-xs last:border-b-0">
      <span className="text-muted">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

export default async function PublicUserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!(await hasPermission(session, "users.view"))) redirect("/admin");
  const { id } = await params;

  const detail = await getPublicUserProfileDetail(id);
  if (!detail) notFound();

  const { overview, personal, preferences, activity, completionSections, sectionReminders, skippedFieldKeys } = detail;
  const skippedFieldKeySet = new Set(skippedFieldKeys);
  const nextAction = nextBestActionText(completionSections);
  const canRemind = await hasPermission(session, "users.manage_notifications");
  const dob = personal.dateOfBirth ? formatDate(personal.dateOfBirth) : null;

  const budgetLabel =
    preferences.budgetMinRupees || preferences.budgetMaxRupees
      ? `${preferences.budgetMinRupees ? formatIndianPriceCompact(preferences.budgetMinRupees) : "Any"} — ${
          preferences.budgetMaxRupees ? formatIndianPriceCompact(preferences.budgetMaxRupees) : "Any"
        }`
      : null;

  const sectionOrder = ["personal", "property", "budget", "location", "status", "purpose", "family"] as const;
  const sectionLabel: Record<(typeof sectionOrder)[number], string> = {
    personal: "Personal Details",
    property: "Property Requirements",
    budget: "Budget",
    location: "Location",
    status: "Property Status",
    purpose: "Purpose",
    family: "Family / Household",
  };

  return (
    <div className="flex flex-col gap-4">
      <BackButton fallbackHref="/admin/analytics/registered-users" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">{overview.name ?? overview.email}</h1>
          <p className="text-xs text-muted">{overview.email}</p>
        </div>
        <div className="rounded-sm border border-accent/40 bg-accent/10 px-3 py-2 text-right">
          <p className="text-[10px] uppercase tracking-wide text-accent">Profile completion</p>
          <p className="font-mono text-xl font-bold text-accent">{overview.profileCompletionPercent}%</p>
        </div>
      </div>

      {nextAction ? (
        <div className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-xs">
          <span className="font-medium text-foreground">Next best action: </span>
          <span className="text-muted">{nextAction}</span>
        </div>
      ) : (
        <div className="rounded-sm border border-positive/40 bg-positive/10 px-3 py-2 text-xs text-positive">Research profile is fully complete.</div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Phone verified" value={overview.phoneVerified ? "Yes" : overview.phone ? "No" : "—"} />
        <Stat label="Registered" value={formatDate(overview.createdAt)} />
        <Stat label="Last active" value={overview.lastActiveAt ? formatRelativeTime(overview.lastActiveAt) : "Never"} />
        <Stat label="Notifications clicked" value={`${activity.notificationsClicked} / ${activity.notificationsReceived}`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="font-mono text-sm font-semibold text-foreground">User Overview</h2>
          <div className="mt-2 flex flex-col">
            <Row label="Phone" value={overview.phone ?? "—"} />
            <Row label="Email verified" value={overview.emailVerified ? "Yes" : "No"} />
            <Row label="Member since" value={formatDate(overview.createdAt)} />
            <Row label="Last active" value={overview.lastActiveAt ? formatDateTime(overview.lastActiveAt) : "Never"} />
          </div>
        </section>

        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="font-mono text-sm font-semibold text-foreground">Personal Details</h2>
          <p className="text-[10px] text-muted">Private — never shown publicly.</p>
          <div className="mt-2 flex flex-col">
            <Row label="Date of birth" value={dob ?? "Not provided"} />
            <Row label="Gender" value={personal.gender ? (GENDER_LABEL[personal.gender] ?? personal.gender) : "Not provided"} />
            <Row label="Current city" value={personal.city ?? "Not provided"} />
            <Row label="Current locality" value={personal.currentLocality ?? "Not provided"} />
            <Row label="Family size" value={personal.familySize ? (FAMILY_SIZE_LABEL[personal.familySize] ?? personal.familySize) : "Not provided"} />
            <Row
              label="Family income"
              value={personal.familyIncomeRange ? (FAMILY_INCOME_LABEL[personal.familyIncomeRange] ?? personal.familyIncomeRange) : "Not provided"}
            />
          </div>
        </section>

        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="font-mono text-sm font-semibold text-foreground">Property Preferences</h2>
          <div className="mt-2 flex flex-col">
            <Row label="Budget" value={budgetLabel ?? "Not provided"} />
            <Row
              label="Property type"
              value={preferences.categories.length ? preferences.categories.map((c) => CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL] ?? c).join(", ") : "Not provided"}
            />
            <Row
              label="Configuration"
              value={preferences.configurations.length ? preferences.configurations.map((c) => CONFIGURATION_LABEL[c] ?? c).join(", ") : "Not provided"}
            />
            <Row
              label="Preferred locations"
              value={
                preferences.localityNames.length || preferences.localityFreeText.length
                  ? [...preferences.localityNames, ...preferences.localityFreeText].join(", ")
                  : "Not provided"
              }
            />
            <Row
              label="Property status"
              value={preferences.readiness.length ? preferences.readiness.map((r) => READINESS_LABEL[r] ?? r).join(", ") : "Not provided"}
            />
            <Row label="Purpose" value={preferences.purposes.length ? preferences.purposes.map((p) => PURPOSE_LABEL[p] ?? p).join(", ") : "Not provided"} />
          </div>
        </section>

        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="font-mono text-sm font-semibold text-foreground">Research Activity</h2>
          <div className="mt-2 flex flex-col">
            <Row label="Searches run" value={String(activity.searchesRun)} />
            <Row label="Projects viewed" value={String(activity.projectsViewed)} />
            <Row label="Projects saved" value={String(activity.projectsSaved)} />
            <Row label="Saved searches" value={String(activity.savedSearches)} />
            <Row label="Reports submitted" value={String(activity.reportsSubmitted)} />
            <Row label="Contact enquiries" value={String(activity.contactEnquiries)} />
            <Row label="Notifications received" value={String(activity.notificationsReceived)} />
            <Row label="Notification clicks" value={String(activity.notificationsClicked)} />
            <Row label="Profile completion events" value={String(activity.profileCompletionEvents)} />
          </div>
        </section>
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="font-mono text-sm font-semibold text-foreground">Profile Completion — {overview.profileCompletionPercent}%</h2>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {sectionOrder.map((sectionKey) => {
            const fields = completionSections.filter((s) => s.section === sectionKey);
            if (fields.length === 0) return null;
            const sectionIncomplete = fields.some((f) => !f.complete);
            return (
              <div key={sectionKey}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{sectionLabel[sectionKey]}</p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {fields.map((f) => {
                    const skipped = !f.complete && skippedFieldKeySet.has(f.key);
                    return (
                      <li key={f.key} className="flex items-center gap-1.5 text-xs">
                        <span aria-hidden="true" className={f.complete ? "text-positive" : "text-muted"}>
                          {f.complete ? "✓" : skipped ? "—" : "○"}
                        </span>
                        <span className={f.complete ? "text-foreground" : "text-muted"}>
                          {f.label}
                          {skipped ? <span className="ml-1 text-[9px] uppercase tracking-wide text-muted">Skipped</span> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {sectionIncomplete && canRemind ? (
                  <SectionReminderButton publicUserId={overview.id} section={sectionKey} history={sectionReminders[sectionKey]} />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {detail.lastReminder ? (
        <div className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-xs text-muted">
          Last reminded {formatDateTime(detail.lastReminder.sentAt)}
          {detail.lastReminder.completionPercentAtSend !== null ? ` (was ${detail.lastReminder.completionPercentAtSend}% complete)` : ""} —{" "}
          {detail.completionIncreasedSinceLastReminder ? (
            <span className="font-medium text-positive">profile has moved forward since</span>
          ) : (
            <span>no further progress yet</span>
          )}
        </div>
      ) : null}

      {canRemind ? <ProfileReminderCard publicUserId={overview.id} /> : null}
    </div>
  );
}
