import { prisma } from "@/lib/prisma";
import { formatPaise, formatPriceBand, formatPricePerSqft } from "@/lib/format";
import { TRANSACTION_TYPE_LABEL, type TransactionType } from "@/lib/project-meta";

/**
 * Public-user "My Dashboard" read layer — Wishlist, Continue Research
 * (Recently Viewed), Saved Searches, Search History. Kept separate from
 * lib/admin-queries.ts (Founder Admin reads) and lib/queries/index.ts
 * (public catalog reads) since this is a third, distinct read boundary:
 * a signed-in public user's own data.
 */

export type DashboardEntityType = "Project" | "Builder" | "Locality" | "Transaction" | "MarketReport";

export interface WishlistItem {
  /** The underlying SavedProject/Wishlist row id — pass to the remove action. */
  id: string;
  entityType: "Project" | "Builder" | "Locality";
  entityId: string;
  name: string;
  imageUrl: string | null;
  subtitle: string | null;
  status: string | null;
  priceLabel: string | null;
  href: string;
  dateAdded: Date;
}

/**
 * Unions the existing SavedProject table (Projects, unchanged since it
 * shipped) with the new generic Wishlist table (Builder/Locality) into one
 * normalized, sortable/searchable list for the dashboard's Wishlist tab.
 */
export async function getWishlistForUser(publicUserId: string): Promise<WishlistItem[]> {
  const [savedProjects, wishlistRows] = await Promise.all([
    prisma.savedProject.findMany({
      where: { publicUserId },
      include: {
        project: {
          include: {
            locality: true,
            builder: true,
            images: { orderBy: { sortOrder: "asc" as const }, take: 1 },
          },
        },
      },
    }),
    prisma.wishlist.findMany({ where: { publicUserId } }),
  ]);

  const projectItems: WishlistItem[] = savedProjects.map((saved) => {
    return {
      id: saved.id,
      entityType: "Project",
      entityId: saved.project.id,
      name: saved.project.name,
      imageUrl: saved.project.images[0]?.url ?? null,
      subtitle: [saved.project.builder?.name, saved.project.locality.name].filter(Boolean).join(" · "),
      status: saved.project.status,
      priceLabel: formatPriceBand(
        saved.project.priceMinPaise !== null ? Number(saved.project.priceMinPaise) : null,
        saved.project.priceMaxPaise !== null ? Number(saved.project.priceMaxPaise) : null
      ),
      href: `/projects/${saved.project.slug}`,
      dateAdded: saved.createdAt,
    };
  });

  const builderIds = wishlistRows.filter((w) => w.entityType === "Builder").map((w) => w.entityId);
  const localityIds = wishlistRows.filter((w) => w.entityType === "Locality").map((w) => w.entityId);

  const [builders, localities] = await Promise.all([
    builderIds.length ? prisma.builder.findMany({ where: { id: { in: builderIds } } }) : Promise.resolve([]),
    localityIds.length ? prisma.locality.findMany({ where: { id: { in: localityIds } } }) : Promise.resolve([]),
  ]);
  const builderById = new Map(builders.map((b) => [b.id, b]));
  const localityById = new Map(localities.map((l) => [l.id, l]));

  const builderAndLocalityItems: WishlistItem[] = wishlistRows
    .map((row): WishlistItem | null => {
      if (row.entityType === "Builder") {
        const b = builderById.get(row.entityId);
        if (!b) return null;
        return {
          id: row.id,
          entityType: "Builder",
          entityId: b.id,
          name: b.name,
          imageUrl: b.logoUrl,
          subtitle: b.headquarters,
          status: null,
          priceLabel: null,
          href: `/builders/${b.slug}`,
          dateAdded: row.createdAt,
        };
      }
      if (row.entityType === "Locality") {
        const l = localityById.get(row.entityId);
        if (!l) return null;
        return {
          id: row.id,
          entityType: "Locality",
          entityId: l.id,
          name: l.name,
          imageUrl: l.coverImageUrl,
          subtitle: l.pincode,
          status: null,
          priceLabel: l.avgPricePerSqftPaise !== null ? formatPricePerSqft(l.avgPricePerSqftPaise) : null,
          href: `/localities/${l.slug}`,
          dateAdded: row.createdAt,
        };
      }
      return null;
    })
    .filter((item): item is WishlistItem => item !== null);

  return [...projectItems, ...builderAndLocalityItems].sort((a, b) => b.dateAdded.getTime() - a.dateAdded.getTime());
}

/** Fixed entityId for the single, entity-less /reports/market page — RecentView still needs an id, this is its sentinel. */
export const MARKET_REPORT_ENTITY_ID = "market";
const RECENT_VIEW_LIMIT = 25;

export interface RecentViewItem {
  /** The underlying RecentView row id — pass to the remove action. */
  id: string;
  entityType: DashboardEntityType;
  entityId: string;
  title: string;
  subtitle: string;
  href: string;
  viewedAt: Date;
}

/** "Continue Research" — the last 25 entities a user opened, across every trackable type, newest first. */
export async function getRecentViewsForUser(publicUserId: string): Promise<RecentViewItem[]> {
  const rows = await prisma.recentView.findMany({
    where: { publicUserId },
    orderBy: { viewedAt: "desc" },
    take: RECENT_VIEW_LIMIT,
  });
  if (rows.length === 0) return [];

  const idsByType = new Map<DashboardEntityType, string[]>();
  for (const row of rows) {
    const type = row.entityType as DashboardEntityType;
    const list = idsByType.get(type) ?? [];
    list.push(row.entityId);
    idsByType.set(type, list);
  }

  const [projects, builders, localities, transactions] = await Promise.all([
    idsByType.has("Project")
      ? prisma.project.findMany({ where: { id: { in: idsByType.get("Project")! } }, select: { id: true, name: true, slug: true, locality: { select: { name: true } } } })
      : Promise.resolve([]),
    idsByType.has("Builder")
      ? prisma.builder.findMany({ where: { id: { in: idsByType.get("Builder")! } }, select: { id: true, name: true, slug: true, headquarters: true } })
      : Promise.resolve([]),
    idsByType.has("Locality")
      ? prisma.locality.findMany({ where: { id: { in: idsByType.get("Locality")! } }, select: { id: true, name: true, slug: true } })
      : Promise.resolve([]),
    idsByType.has("Transaction")
      ? prisma.transaction.findMany({
          where: { id: { in: idsByType.get("Transaction")! } },
          select: { id: true, type: true, valuePaise: true, locality: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const builderById = new Map(builders.map((b) => [b.id, b]));
  const localityById = new Map(localities.map((l) => [l.id, l]));
  const transactionById = new Map(transactions.map((t) => [t.id, t]));

  return rows
    .map((row): RecentViewItem | null => {
      const entityType = row.entityType as DashboardEntityType;
      if (entityType === "Project") {
        const p = projectById.get(row.entityId);
        if (!p) return null;
        return { id: row.id, entityType, entityId: p.id, title: p.name, subtitle: p.locality.name, href: `/projects/${p.slug}`, viewedAt: row.viewedAt };
      }
      if (entityType === "Builder") {
        const b = builderById.get(row.entityId);
        if (!b) return null;
        return { id: row.id, entityType, entityId: b.id, title: b.name, subtitle: "Builder Profile", href: `/builders/${b.slug}`, viewedAt: row.viewedAt };
      }
      if (entityType === "Locality") {
        const l = localityById.get(row.entityId);
        if (!l) return null;
        return { id: row.id, entityType, entityId: l.id, title: l.name, subtitle: "Locality Intelligence", href: `/localities/${l.slug}`, viewedAt: row.viewedAt };
      }
      if (entityType === "Transaction") {
        const t = transactionById.get(row.entityId);
        if (!t) return null;
        return {
          id: row.id,
          entityType,
          entityId: t.id,
          title: `${TRANSACTION_TYPE_LABEL[t.type as TransactionType]} · ${formatPaise(t.valuePaise)}`,
          subtitle: t.locality.name,
          href: `/transactions/${t.id}`,
          viewedAt: row.viewedAt,
        };
      }
      if (entityType === "MarketReport") {
        return {
          id: row.id,
          entityType,
          entityId: row.entityId,
          title: "Mumbai Market Report",
          subtitle: "Market Intelligence",
          href: "/reports/market",
          viewedAt: row.viewedAt,
        };
      }
      return null;
    })
    .filter((item): item is RecentViewItem => item !== null);
}

export interface SavedSearchItem {
  id: string;
  label: string;
  filters: Record<string, string>;
  notifyOnMatch: boolean;
  createdAt: Date;
  /** /projects?<filters serialized> — ready to use directly in a <Link href>. */
  href: string;
}

function filtersToQueryString(filters: unknown): Record<string, string> {
  if (typeof filters !== "object" || filters === null) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    if (value !== null && value !== undefined && value !== "") out[key] = String(value);
  }
  return out;
}

export async function getSavedSearchesForUser(publicUserId: string): Promise<SavedSearchItem[]> {
  const rows = await prisma.savedSearch.findMany({ where: { publicUserId }, orderBy: { createdAt: "desc" } });
  return rows.map((row) => {
    const filters = filtersToQueryString(row.filtersJson);
    const qs = new URLSearchParams(filters).toString();
    return {
      id: row.id,
      label: row.label,
      filters,
      notifyOnMatch: row.notifyOnMatch,
      createdAt: row.createdAt,
      href: qs ? `/projects?${qs}` : "/projects",
    };
  });
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  searchedAt: Date;
}

const SEARCH_HISTORY_LIMIT = 25;

export async function getSearchHistoryForUser(publicUserId: string): Promise<SearchHistoryItem[]> {
  const rows = await prisma.searchHistory.findMany({
    where: { publicUserId },
    orderBy: { searchedAt: "desc" },
    take: SEARCH_HISTORY_LIMIT,
  });
  return rows;
}

export interface PopularSearchItem {
  query: string;
  count: number;
}

/** Site-wide most-searched terms across every logged-in user's history — the "Popular Searches" list. */
export async function getPopularSearches(limit = 10): Promise<PopularSearchItem[]> {
  const grouped = await prisma.searchHistory.groupBy({
    by: ["query"],
    _count: { _all: true },
    orderBy: { _count: { query: "desc" } },
    take: limit,
  });
  return grouped.map((g) => ({ query: g.query, count: g._count._all }));
}

export async function getUserPreferences(publicUserId: string) {
  return prisma.userPreferences.findUnique({ where: { publicUserId } });
}

export async function getNotificationPreferences(publicUserId: string) {
  return prisma.notificationPreferences.findUnique({ where: { publicUserId } });
}
