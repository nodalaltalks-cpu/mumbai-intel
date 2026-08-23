import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePublicSession } from "@/lib/public-auth/guard";
import { logoutAction } from "@/lib/actions/public-auth";
import { getSavedProjectsForUser } from "@/lib/queries";
import { getLocalitiesForSelect } from "@/lib/admin-queries";
import {
  getWishlistForUser,
  getRecentViewsForUser,
  getSavedSearchesForUser,
  getUserPreferences,
  getNotificationPreferences,
  getDashboardNextActionSignals,
} from "@/lib/queries/dashboard";
import { removeWishlistItemAction } from "@/lib/actions/wishlist";
import { toggleSavedProjectAction } from "@/lib/actions/saved-projects";
import { removeRecentViewAction, clearRecentViewsAction } from "@/lib/actions/recent-views";
import { deleteSavedSearchAction, toggleSavedSearchNotifyAction } from "@/lib/actions/saved-searches";
import { formatDate, formatRelativeTime } from "@/lib/format";
import BrochureDownloadLink from "@/app/components/BrochureDownloadLink";
import ContinueResearchLink from "@/app/components/ContinueResearchLink";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import { Fact } from "@/app/components/ui/StatCard";
import ProjectCard from "@/app/components/ProjectCard";
import EmptyState from "@/app/components/ui/EmptyState";
import Button from "@/app/components/ui/Button";
import RemoveItemButton from "@/app/components/RemoveItemButton";
import ClearAllButton from "@/app/components/ClearAllButton";
import NextActionCard from "@/app/components/NextActionCard";
import SavedSearchAlertToggle from "./SavedSearchAlertToggle";
import NotificationPreferencesForm from "./NotificationPreferencesForm";
import ProfileForm from "./ProfileForm";
import PropertyPreferencesForm from "./PropertyPreferencesForm";
import PropertyStatusForm from "./PropertyStatusForm";
import FamilyForm from "./FamilyForm";
import BudgetPreferenceForm from "./BudgetPreferenceForm";
import LocationsPreferenceForm from "./LocationsPreferenceForm";
import PurposeForm from "./PurposeForm";
import VerifyEmailButton from "./VerifyEmailButton";
import ProfileCompletionBar from "@/app/components/ui/ProfileCompletionBar";
import ProfileMilestoneToast from "@/app/components/ui/ProfileMilestoneToast";
import StickyCompletionIndicator from "@/app/components/ui/StickyCompletionIndicator";
import { ProfileCompletionProvider } from "@/lib/profile-completion-client";
import { getCompletionSections } from "@/lib/profile-completion";
import { resolveNextAction } from "@/lib/dashboard-next-action";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import { generateUniqueReferralCode } from "@/lib/referral";
import ShareReferralCard from "@/app/components/ShareReferralCard";

export const metadata: Metadata = { title: "My Dashboard - NoDalalTalks" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "research", label: "Continue Research" },
  { key: "wishlist", label: "Wishlist" },
  { key: "searches", label: "Saved Searches" },
  { key: "profile", label: "Profile" },
] as const;

/** Profile gets its own visually-stronger pill style below with a completion badge, rather than blending into the plain tab row, to nudge profile completion without reading as an ad. Search History deliberately isn't a top-level tab — it's folded into the Profile tab (#research-activity) since it's reference material, not a primary action surface. */
const PRIMARY_TAB_KEYS = ["research", "wishlist", "searches"] as const;

function greeting(): string {
  const hourIst = (new Date().getUTCHours() + 5.5) % 24;
  if (hourIst < 5) return "Good night";
  if (hourIst < 12) return "Good morning";
  if (hourIst < 17) return "Good afternoon";
  return "Good evening";
}

type TabKey = (typeof TABS)[number]["key"];

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requirePublicSession("/account");
  const sp = await searchParams;
  // "history" was a top-level tab before Search History was retired from the
  // dashboard entirely (records are preserved, just no longer surfaced here)
  // — redirect old bookmarks/links to Profile instead of silently falling
  // back to Continue Research.
  const requestedTab = sp.tab === "history" ? "profile" : sp.tab;
  const tab = (TABS.some((t) => t.key === requestedTab) ? requestedTab : "research") as TabKey;

  // Each query below is gated to the active tab — viewing "Continue Research"
  // shouldn't also pay for the Wishlist join, Saved Searches, preferences,
  // notification-preferences, and getLocalitiesForSelect() queries that only
  // the Profile tab needs. `user`
  // and the next-action signals are the exceptions: the header and the
  // dashboard-wide "what should I do next" card render on every tab.
  // eslint-disable-next-line prefer-const -- `user` is reassigned below by the referralCode lazy-backfill
  let [user, savedProjects, wishlist, recentViews, savedSearches, preferences, notificationPreferences, localities, nextActionSignals] =
    await Promise.all([
    prisma.publicUser.findUnique({ where: { id: session.userId } }),
    tab === "profile" ? getSavedProjectsForUser(session.userId) : Promise.resolve([]),
    tab === "wishlist" ? getWishlistForUser(session.userId) : Promise.resolve([]),
    tab === "research" ? getRecentViewsForUser(session.userId) : Promise.resolve([]),
    tab === "searches" ? getSavedSearchesForUser(session.userId) : Promise.resolve([]),
    tab === "profile" ? getUserPreferences(session.userId) : Promise.resolve(null),
    tab === "profile" ? getNotificationPreferences(session.userId) : Promise.resolve(null),
    tab === "profile" ? getLocalitiesForSelect() : Promise.resolve([]),
    getDashboardNextActionSignals(session.userId),
  ]);
  if (!user) notFound();

  // Lazy backfill: accounts created before the referral feature shipped have
  // no referralCode. One-time self-heal on next /account view rather than a
  // bulk migration script -- cheap, and every account gets one exactly once.
  if (!user.referralCode) {
    const referralCode = await generateUniqueReferralCode();
    user = await prisma.publicUser.update({ where: { id: user.id }, data: { referralCode } });
  }

  if (tab === "profile") {
    await recordResearchEvent("PROFILE_VIEWED", { entityType: "PublicUser", entityId: user.id });
  }

  const completionSections =
    tab === "profile"
      ? getCompletionSections({
          name: user.name,
          phone: user.phone,
          emailVerified: user.emailVerifiedAt !== null,
          preferredBudgetMinRupees: preferences?.preferredBudgetMinRupees ?? null,
          preferredBudgetMaxRupees: preferences?.preferredBudgetMaxRupees ?? null,
          preferredLocalityIds: preferences?.preferredLocalityIds ?? [],
          localityFreeText: preferences?.localityFreeText ?? [],
          preferredCategories: preferences?.preferredCategories ?? [],
          preferredConfigurations: preferences?.preferredConfigurations ?? [],
          preferredReadiness: preferences?.preferredReadiness ?? [],
          purposes: preferences?.purposes ?? [],
          familySize: preferences?.familySize ?? null,
          familyIncomeRange: preferences?.familyIncomeRange ?? null,
        })
      : [];

  const nextAction = resolveNextAction({ profileCompletionPercent: user.profileCompletionPercent, ...nextActionSignals });

  function tabHref(key: TabKey) {
    return `/account?tab=${key}`;
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />

      <main id="main-content" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-raised text-lg font-mono font-semibold text-foreground">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              (user.name ?? user.email).slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-mono text-xl font-bold text-foreground sm:text-2xl">
              {greeting()}
              {user.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            <p className="text-sm text-muted">Your property research home</p>
          </div>
        </div>

        {nextAction ? <NextActionCard action={nextAction} /> : null}

        <ShareReferralCard referralCode={user.referralCode as string} />

        <div className="flex items-center gap-2 overflow-x-auto border-b border-border pb-px">
          {TABS.filter((t) => (PRIMARY_TAB_KEYS as readonly string[]).includes(t.key)).map((t) => (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={`shrink-0 rounded-t-sm border-b-2 px-3 py-2 text-xs font-mono uppercase tracking-wide transition-colors ${
                tab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          ))}
          <Link
            href={tabHref("profile")}
            className={`ml-auto flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-mono font-semibold uppercase tracking-wide transition-colors ${
              tab === "profile" ? "bg-accent text-white" : "bg-accent/10 text-accent hover:bg-accent/20"
            }`}
          >
            Profile
            {user.profileCompletionPercent < 100 ? (
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${tab === "profile" ? "bg-white/20" : "bg-accent/15"}`}>
                {user.profileCompletionPercent}%
              </span>
            ) : (
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${tab === "profile" ? "bg-white/20" : "bg-accent/15"}`} aria-label="Complete">
                ✓
              </span>
            )}
          </Link>
        </div>

        {tab === "research" ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-mono text-sm font-semibold text-foreground">Continue Research</h2>
                <p className="text-xs text-muted">Everything you&apos;ve opened, newest first. Pick up right where you left off.</p>
              </div>
              {recentViews.length > 0 ? (
                <ClearAllButton action={clearRecentViewsAction} confirmText="Clear your entire Continue Research history?" label="Clear History" />
              ) : null}
            </div>
            {recentViews.length === 0 ? (
              <EmptyState
                title="Your research trail is empty"
                message="Open a project, builder, locality, transaction, or the market report and we'll keep track of it here."
                cta={{ label: "Explore projects", href: "/projects" }}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {recentViews.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface p-3">
                    <ContinueResearchLink href={item.href} entityType={item.entityType} entityId={item.entityId} className="flex min-w-0 flex-1 items-center gap-3">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-sm border border-border object-cover" />
                      ) : null}
                      <span className="min-w-0">
                        <p className="truncate font-mono text-sm text-foreground hover:text-accent">{item.title}</p>
                        <p className="truncate text-xs text-muted">
                          {item.subtitle} · Viewed {formatRelativeTime(item.viewedAt)}
                        </p>
                      </span>
                    </ContinueResearchLink>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {item.brochureUrl && item.projectSlug ? (
                        <BrochureDownloadLink
                          slug={item.projectSlug}
                          brochureUrl={item.brochureUrl}
                          brochureFileName={item.brochureFileName}
                          className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                        >
                          {item.brochureThumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.brochureThumbnailUrl} alt="" className="h-5 w-4 rounded-sm object-cover" />
                          ) : null}
                          Brochure
                        </BrochureDownloadLink>
                      ) : null}
                      <ContinueResearchLink
                        href={item.href}
                        entityType={item.entityType}
                        entityId={item.entityId}
                        className="rounded-sm border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                      >
                        Open
                      </ContinueResearchLink>
                      <RemoveItemButton action={removeRecentViewAction.bind(null, item.id)} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {tab === "wishlist" ? (
          <section className="flex flex-col gap-3">
            <h2 className="font-mono text-sm font-semibold text-foreground">Wishlist</h2>
            {wishlist.length === 0 ? (
              <EmptyState
                title="Your research list is empty"
                message="Save projects, builders or localities you want to compare later — one tap on any page."
                cta={{ label: "Explore projects", href: "/projects" }}
              />
            ) : (
              <div className="overflow-x-auto rounded-sm border border-border">
                <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Details</th>
                      <th className="px-3 py-2 font-medium">Price</th>
                      <th className="px-3 py-2 font-medium">Added</th>
                      <th className="px-3 py-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wishlist.map((item) => (
                      <tr key={item.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                        <td className="px-3 py-2">
                          <Link href={item.href} className="flex items-center gap-2 font-mono text-foreground hover:text-accent">
                            {item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded-sm border border-border object-cover" />
                            ) : null}
                            {item.name}
                          </Link>
                          {item.status ? <span className="ml-1.5 rounded-sm border border-border px-1 py-0.5 text-[9px] uppercase text-muted">{item.status}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-muted">{item.entityType}</td>
                        <td className="px-3 py-2 text-muted">{item.subtitle ?? "--"}</td>
                        <td className="px-3 py-2 text-muted">{item.priceLabel ?? "--"}</td>
                        <td className="px-3 py-2 text-muted">{formatDate(item.dateAdded)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1.5">
                            {item.brochureUrl && item.projectSlug ? (
                              <BrochureDownloadLink
                                slug={item.projectSlug}
                                brochureUrl={item.brochureUrl}
                                brochureFileName={item.brochureFileName}
                                className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                              >
                                {item.brochureThumbnailUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={item.brochureThumbnailUrl} alt="" className="h-5 w-4 rounded-sm object-cover" />
                                ) : null}
                                Brochure
                              </BrochureDownloadLink>
                            ) : null}
                            <Link href={item.href} className="rounded-sm border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
                              Open
                            </Link>
                            <RemoveItemButton
                              action={
                                item.entityType === "Project"
                                  ? toggleSavedProjectAction.bind(null, item.entityId)
                                  : removeWishlistItemAction.bind(null, item.id)
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {tab === "searches" ? (
          <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <h2 className="font-mono text-sm font-semibold text-foreground">Saved Searches</h2>
              {savedSearches.length === 0 ? (
                <EmptyState
                  title="No saved searches yet"
                  message="Save a search to quickly return to it later — use “Save Search” on the Projects page."
                  cta={{ label: "Start a search", href: "/projects" }}
                />
              ) : (
                <>
                  <p className="text-[11px] text-muted">
                    Alerts aren&apos;t live yet — turning one on saves your preference so you&apos;re ready the moment match notifications launch.
                  </p>
                  <ul className="flex flex-col gap-2">
                    {savedSearches.map((search) => (
                      <li key={search.id} className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface p-3">
                        <Link href={search.href} className="min-w-0 flex-1">
                          <p className="truncate font-mono text-sm text-foreground hover:text-accent">{search.label}</p>
                          <p className="text-xs text-muted">Saved {formatDate(search.createdAt)}</p>
                        </Link>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <SavedSearchAlertToggle id={search.id} notifyOnMatch={search.notifyOnMatch} />
                          <Link href={search.href} className="rounded-sm border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
                            Run
                          </Link>
                          <RemoveItemButton action={deleteSavedSearchAction.bind(null, search.id)} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>
        ) : null}

        {tab === "profile" ? (
          <ProfileCompletionProvider userId={user.id} initialSections={completionSections} initialPercent={user.profileCompletionPercent}>
          <section className="flex flex-col gap-6">
            <p className="text-[11px] text-muted">
              Research freely, with no phone number required and no spam calls. Everything below is private, optional, and never shared with brokers or developers.
            </p>

            <div id="profile-completion-top" className="rounded-sm border border-border bg-surface p-4">
              <ProfileCompletionBar />
            </div>

            <div id="basic-profile" className="scroll-mt-24 rounded-sm border border-border bg-surface p-4">
              <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Personal Details</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Fact label="Email" value={user.email} />
                <Fact
                  label="Sign-in method"
                  value={
                    user.googleId && user.passwordHash
                      ? "Email & password + Google"
                      : user.googleId
                        ? "Google"
                        : "Email & password"
                  }
                />
                <Fact label="Member since" value={formatDate(user.createdAt)} />
                <Fact label="Last sign-in" value={user.lastLoginAt ? formatDate(user.lastLoginAt) : "--"} />
              </div>
              <div className="mt-3">
                <VerifyEmailButton verified={user.emailVerifiedAt !== null} />
              </div>
              <div className="mt-4 border-t border-border pt-4">
                <ProfileForm
                  name={user.name}
                  phone={user.phone}
                  city={user.city}
                  currentLocality={user.currentLocality}
                  phoneVerified={user.phoneVerifiedAt !== null}
                />
              </div>
            </div>

            <div>
              <h2 className="font-mono text-sm font-semibold text-foreground">Research Profile</h2>
              <p className="mt-1 text-xs text-muted">
                Tell us what you&apos;re looking for and we&apos;ll make your property research more relevant. Answer what&apos;s useful to you, skip
                the rest, and come back anytime. <span className="text-foreground">Why we ask:</span> filling these details helps us recommend
                properties that are more relevant to you — it&apos;s never used for anything else.
              </p>
            </div>

            <div id="budget" className="scroll-mt-24 rounded-sm border border-border bg-surface p-4">
              <h3 className="font-mono text-xs uppercase tracking-wide text-muted">Budget</h3>
              <p className="mt-1 text-[11px] text-muted">Type an amount (e.g. &ldquo;1.2 Cr&rdquo; or &ldquo;75 Lakh&rdquo;) or drag the range. Takes about 20 seconds.</p>
              <div className="mt-3">
                <BudgetPreferenceForm minRupees={preferences?.preferredBudgetMinRupees ?? null} maxRupees={preferences?.preferredBudgetMaxRupees ?? null} />
              </div>
            </div>

            <div id="property-type" className="scroll-mt-24 rounded-sm border border-border bg-surface p-4">
              <h3 className="font-mono text-xs uppercase tracking-wide text-muted">Property Type &amp; Configuration</h3>
              <p className="mt-1 text-[11px] text-muted">Tap what applies. Takes about 20 seconds.</p>
              <div className="mt-3">
                <PropertyPreferencesForm
                  preferredCategories={preferences?.preferredCategories ?? []}
                  preferredConfigurations={preferences?.preferredConfigurations ?? []}
                />
              </div>
            </div>

            <div id="property-status" className="scroll-mt-24 rounded-sm border border-border bg-surface p-4">
              <h3 className="font-mono text-xs uppercase tracking-wide text-muted">Property Status</h3>
              <p className="mt-1 text-[11px] text-muted">What construction stage are you open to? Select any that apply.</p>
              <div className="mt-3">
                <PropertyStatusForm preferredReadiness={preferences?.preferredReadiness ?? []} />
              </div>
            </div>

            <div id="purpose" className="scroll-mt-24 rounded-sm border border-border bg-surface p-4">
              <h3 className="font-mono text-xs uppercase tracking-wide text-muted">What are you looking for?</h3>
              <p className="mt-1 text-[11px] text-muted">Select any that apply. You can be both.</p>
              <div className="mt-3">
                <PurposeForm purposes={preferences?.purposes ?? []} />
              </div>
            </div>

            <div id="locations" className="scroll-mt-24 rounded-sm border border-border bg-surface p-4">
              <h3 className="font-mono text-xs uppercase tracking-wide text-muted">Preferred Locations</h3>
              <p className="mt-1 text-[11px] text-muted">Add a location or landmark. Takes about 30 seconds.</p>
              <div className="mt-3">
                <LocationsPreferenceForm
                  preferredLocalityIds={preferences?.preferredLocalityIds ?? []}
                  localityFreeText={preferences?.localityFreeText ?? []}
                  localities={localities}
                />
              </div>
            </div>

            <div id="family" className="scroll-mt-24 rounded-sm border border-border bg-surface p-4">
              <h3 className="font-mono text-xs uppercase tracking-wide text-muted">Family / Household</h3>
              <p className="mt-1 text-[11px] text-muted">Optional and private — never shown publicly. Helps us understand space and budget needs.</p>
              <div className="mt-3">
                <FamilyForm familySize={preferences?.familySize ?? null} familyIncomeRange={preferences?.familyIncomeRange ?? null} />
              </div>
            </div>

            <div className="rounded-sm border border-border bg-surface p-4">
              <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Notifications</h2>
              <div className="mt-3">
                <NotificationPreferencesForm preferences={notificationPreferences} />
              </div>
            </div>

            <section id="saved-projects" className="scroll-mt-24">
              <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Saved Projects</h2>
              {savedProjects.length > 0 ? (
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {savedProjects.map((project) => (
                    <ProjectCard key={project.id} project={project} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  className="mt-3"
                  title="No saved projects yet"
                  message="Tap Save on any project page to bookmark it here."
                  cta={{ label: "Explore projects", href: "/projects" }}
                />
              )}
            </section>

            <form action={logoutAction}>
              <Button type="submit" variant="danger" size="sm">
                Logout
              </Button>
            </form>
          </section>
          <ProfileMilestoneToast />
          <StickyCompletionIndicator anchorId="profile-completion-top" />
          </ProfileCompletionProvider>
        ) : null}
      </main>

      <Footer />
    </div>
  );
}
