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
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import { Fact } from "@/app/components/ui/StatCard";
import ProjectCard from "@/app/components/ProjectCard";
import EmptyState from "@/app/components/ui/EmptyState";
import Button from "@/app/components/ui/Button";
import RemoveItemButton from "@/app/components/RemoveItemButton";
import ClearAllButton from "@/app/components/ClearAllButton";
import PreferencesForm from "./PreferencesForm";
import NotificationPreferencesForm from "./NotificationPreferencesForm";

export const metadata: Metadata = { title: "My Dashboard — Mumbai Intel" };
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

  const [user, savedProjects, wishlist, recentViews, savedSearches, searchHistory, popularSearches, preferences, notificationPreferences, localities] =
    await Promise.all([
      prisma.publicUser.findUnique({ where: { id: session.userId } }),
      getSavedProjectsForUser(session.userId),
      getWishlistForUser(session.userId),
      getRecentViewsForUser(session.userId),
      getSavedSearchesForUser(session.userId),
      getSearchHistoryForUser(session.userId),
      getPopularSearches(8),
      getUserPreferences(session.userId),
      getNotificationPreferences(session.userId),
      getLocalitiesForSelect(),
    ]);
  if (!user) notFound();

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
                    <Link href={item.href} className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm text-foreground hover:text-accent">{item.title}</p>
                      <p className="truncate text-xs text-muted">
                        {item.subtitle} · Viewed {formatRelativeTime(item.viewedAt)}
                      </p>
                    </Link>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Link href={item.href} className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
                        Open
                      </Link>
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
                          <Link href={item.href} className="font-mono text-foreground hover:text-accent">
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
                            <Link href={item.href} className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
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
                        <Link href={search.href} className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
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
            <div className="rounded-sm border border-border bg-surface p-4">
              <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Account Details</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Fact label="Name" value={user.name ?? "--"} />
                <Fact label="Email" value={user.email} />
                <Fact label="Phone" value={user.phone ?? "Not added"} />
                <Fact label="Sign-in method" value={user.provider === "GOOGLE" ? "Google" : "Email & password"} />
                <Fact label="Member since" value={formatDate(user.createdAt)} />
                <Fact label="Last sign-in" value={user.lastLoginAt ? formatDate(user.lastLoginAt) : "--"} />
              </div>
            </div>

            <div className="rounded-sm border border-border bg-surface p-4">
              <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Preferences</h2>
              <div className="mt-3">
                <PreferencesForm preferences={preferences} localities={localities} />
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
