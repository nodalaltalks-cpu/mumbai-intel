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
  getSearchHistoryForUser,
  getPopularSearches,
  getUserPreferences,
  getNotificationPreferences,
} from "@/lib/queries/dashboard";
import { removeWishlistItemAction } from "@/lib/actions/wishlist";
import { toggleSavedProjectAction } from "@/lib/actions/saved-projects";
import { removeRecentViewAction, clearRecentViewsAction } from "@/lib/actions/recent-views";
import { deleteSavedSearchAction } from "@/lib/actions/saved-searches";
import { clearSearchHistoryAction } from "@/lib/actions/search-history";
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
import NotificationPreferencesForm from "./NotificationPreferencesForm";
import ProfileForm from "./ProfileForm";
import PropertyPreferencesForm from "./PropertyPreferencesForm";
import BudgetPreferenceForm from "./BudgetPreferenceForm";
import LocationsPreferenceForm from "./LocationsPreferenceForm";
import PurposeForm from "./PurposeForm";
import PhoneVerificationCard from "./PhoneVerificationCard";
import ProfileCompletionBar from "@/app/components/ui/ProfileCompletionBar";
import { getCompletionSections } from "@/lib/profile-completion";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import { generateUniqueReferralCode } from "@/lib/referral";
import ShareReferralCard from "@/app/components/ShareReferralCard";

export const metadata: Metadata = { title: "My Dashboard — NoDalalTalks" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "research", label: "Continue Research" },
  { key: "wishlist", label: "Wishlist" },
  { key: "searches", label: "Saved Searches" },
  { key: "history", label: "Search History" },
  { key: "profile", label: "Profile" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requirePublicSession("/account");
  const sp = await searchParams;
  const tab = (TABS.some((t) => t.key === sp.tab) ? sp.tab : "research") as TabKey;

  // Each query below is gated to the active tab — viewing "Continue Research"
  // shouldn't also pay for the Wishlist join, Saved Searches, Search History,
  // Popular Searches, preferences, notification-preferences, and
  // getLocalitiesForSelect() queries that only the Profile tab needs. `user`
  // is the one exception: the header (name/avatar) renders on every tab.
  // eslint-disable-next-line prefer-const -- `user` is reassigned below by the referralCode lazy-backfill
  let [user, savedProjects, wishlist, recentViews, savedSearches, searchHistory, popularSearches, preferences, notificationPreferences, localities] =
    await Promise.all([
      prisma.publicUser.findUnique({ where: { id: session.userId } }),
      tab === "profile" ? getSavedProjectsForUser(session.userId) : Promise.resolve([]),
      tab === "wishlist" ? getWishlistForUser(session.userId) : Promise.resolve([]),
      tab === "research" ? getRecentViewsForUser(session.userId) : Promise.resolve([]),
      tab === "searches" ? getSavedSearchesForUser(session.userId) : Promise.resolve([]),
      tab === "history" ? getSearchHistoryForUser(session.userId) : Promise.resolve([]),
      tab === "history" ? getPopularSearches(8) : Promise.resolve([]),
      tab === "profile" ? getUserPreferences(session.userId) : Promise.resolve(null),
      tab === "profile" ? getNotificationPreferences(session.userId) : Promise.resolve(null),
      tab === "profile" ? getLocalitiesForSelect() : Promise.resolve([]),
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
          preferredCategory: preferences?.preferredCategory ?? null,
          purposes: preferences?.purposes ?? [],
        })
      : [];

  function tabHref(key: TabKey) {
    return `/account?tab=${key}`;
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />

      <main id="main-content" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-raised text-lg font-mono font-semibold text-foreground">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              (user.name ?? user.email).slice(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <h1 className="font-mono text-2xl font-bold text-foreground">My Dashboard</h1>
            <p className="text-sm text-muted">{user.name ?? user.email}</p>
          </div>
        </div>

        <ShareReferralCard referralCode={user.referralCode as string} />

        <div className="flex flex-wrap gap-1 overflow-x-auto border-b border-border pb-px">
          {TABS.map((t) => (
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
        </div>

        {tab === "research" ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-mono text-sm font-semibold text-foreground">Continue Research</h2>
                <p className="text-xs text-muted">Everything you&apos;ve opened, newest first — pick up right where you left off.</p>
              </div>
              {recentViews.length > 0 ? (
                <ClearAllButton action={clearRecentViewsAction} confirmText="Clear your entire Continue Research history?" label="Clear History" />
              ) : null}
            </div>
            {recentViews.length === 0 ? (
              <EmptyState title="Nothing viewed yet" message="Open a project, builder, locality, transaction, or the market report to start building your research trail." />
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
              <EmptyState title="Your wishlist is empty" message="Tap Save on any project, builder, or locality page to bookmark it here." />
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
                <EmptyState title="No saved searches yet" message="Use “Save Search” on the Projects page to store a filter combination and revisit it anytime." />
              ) : (
                <ul className="flex flex-col gap-2">
                  {savedSearches.map((search) => (
                    <li key={search.id} className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface p-3">
                      <Link href={search.href} className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm text-foreground hover:text-accent">{search.label}</p>
                        <p className="text-xs text-muted">Saved {formatDate(search.createdAt)}</p>
                      </Link>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Link href={search.href} className="rounded-sm border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
                          Run
                        </Link>
                        <RemoveItemButton action={deleteSavedSearchAction.bind(null, search.id)} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}

        {tab === "history" ? (
          <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-mono text-sm font-semibold text-foreground">Recent Searches</h2>
                {searchHistory.length > 0 ? (
                  <ClearAllButton action={clearSearchHistoryAction} confirmText="Clear your entire search history?" label="Clear History" />
                ) : null}
              </div>
              {searchHistory.length === 0 ? (
                <EmptyState title="No search history yet" message="Searches you run while signed in will appear here, synced across devices." />
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {searchHistory.map((h) => (
                    <li key={h.id}>
                      <Link
                        href={`/projects?q=${encodeURIComponent(h.query)}`}
                        className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:border-accent hover:text-accent"
                      >
                        {h.query}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {popularSearches.length > 0 ? (
              <div className="flex flex-col gap-3">
                <h2 className="font-mono text-sm font-semibold text-foreground">Popular Searches</h2>
                <ul className="flex flex-wrap gap-1.5">
                  {popularSearches.map((p) => (
                    <li key={p.query}>
                      <Link
                        href={`/projects?q=${encodeURIComponent(p.query)}`}
                        className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:border-accent hover:text-accent"
                      >
                        {p.query} <span className="text-muted/60">({p.count})</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === "profile" ? (
          <section className="flex flex-col gap-6">
            <p className="text-[11px] text-muted">
              Research freely — no phone number required, no spam calls. Everything below is private, optional, and never shared with brokers or developers.
            </p>

            <div className="rounded-sm border border-border bg-surface p-4">
              <ProfileCompletionBar percent={user.profileCompletionPercent} sections={completionSections} />
            </div>

            <div className="rounded-sm border border-border bg-surface p-4">
              <h2 className="font-mono text-xs uppercase tracking-wide text-muted">About You</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
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
              <div className="mt-4 border-t border-border pt-4">
                <ProfileForm name={user.name} phone={user.phone} city={user.city} currentLocality={user.currentLocality} />
                <PhoneVerificationCard verified={user.phoneVerifiedAt !== null} />
              </div>
            </div>

            <div className="rounded-sm border border-border bg-surface p-4">
              <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Property Preferences</h2>
              <p className="mt-1 text-[11px] text-muted">Optional — helps us surface more relevant projects. Nothing here is required to keep researching.</p>
              <div className="mt-3">
                <PropertyPreferencesForm
                  preferredCategory={preferences?.preferredCategory ?? null}
                  preferredConfigurations={preferences?.preferredConfigurations ?? []}
                  preferredReadiness={preferences?.preferredReadiness ?? []}
                />
              </div>
            </div>

            <div className="rounded-sm border border-border bg-surface p-4">
              <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Budget</h2>
              <div className="mt-3">
                <BudgetPreferenceForm minRupees={preferences?.preferredBudgetMinRupees ?? null} maxRupees={preferences?.preferredBudgetMaxRupees ?? null} />
              </div>
            </div>

            <div className="rounded-sm border border-border bg-surface p-4">
              <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Locations</h2>
              <div className="mt-3">
                <LocationsPreferenceForm
                  preferredLocalityIds={preferences?.preferredLocalityIds ?? []}
                  localityFreeText={preferences?.localityFreeText ?? []}
                  localities={localities}
                />
              </div>
            </div>

            <div className="rounded-sm border border-border bg-surface p-4">
              <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Purpose</h2>
              <div className="mt-3">
                <PurposeForm purposes={preferences?.purposes ?? []} />
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
                <EmptyState className="mt-3" title="No saved projects yet" message="Tap Save on any project page to bookmark it here." />
              )}
            </section>

            <form action={logoutAction}>
              <Button type="submit" variant="danger" size="sm">
                Logout
              </Button>
            </form>
          </section>
        ) : null}
      </main>

      <Footer />
    </div>
  );
}
