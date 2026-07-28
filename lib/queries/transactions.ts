import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TransactionAnalyticsService } from "@/lib/analytics";
import { PRIMARY_CITY_SLUG } from "./shared";

/**
 * Public transaction intelligence — listing, stats, charts, detail. A
 * transaction is visible whenever it belongs to a Mumbai locality; unlike
 * Project/Builder/Locality there's no isPublished flag on Transaction itself
 * (it mirrors getLatestTransactions/getTopLocalitiesByActivity). Related
 * project/builder links are only rendered when that entity is published —
 * the include below carries isPublished so callers can decide.
 */

const PUBLIC_TRANSACTION_INCLUDE = {
  locality: { select: { name: true, slug: true } },
  project: {
    select: {
      name: true,
      slug: true,
      status: true,
      category: true,
      isPublished: true,
      isArchived: true,
      builder: { select: { name: true, slug: true, logoUrl: true, isPublished: true, isArchived: true } },
    },
  },
} satisfies Prisma.TransactionInclude;

type PublicTransactionRow = Prisma.TransactionGetPayload<{ include: typeof PUBLIC_TRANSACTION_INCLUDE }>;

function mapPublicTransaction(tx: PublicTransactionRow) {
  const projectVisible = tx.project?.isPublished === true && tx.project?.isArchived === false;
  const builderVisible = tx.project?.builder?.isPublished === true && tx.project?.builder?.isArchived === false;
  return {
    id: tx.id,
    type: tx.type,
    registrationDate: tx.registrationDate,
    valuePaise: Number(tx.valuePaise),
    pricePerSqftPaise: tx.pricePerSqftPaise !== null ? Number(tx.pricePerSqftPaise) : null,
    carpetSqft: tx.carpetSqft !== null ? Number(tx.carpetSqft) : null,
    builtUpSqft: tx.builtUpSqft !== null ? Number(tx.builtUpSqft) : null,
    bedrooms: tx.bedrooms !== null ? Number(tx.bedrooms) : null,
    floor: tx.floor,
    tower: tx.tower,
    unitLabel: tx.unitLabel,
    buyerType: tx.buyerType,
    sourceRef: tx.sourceRef,
    dataSource: tx.dataSource,
    confidence: tx.confidence,
    localityId: tx.localityId,
    localityName: tx.locality.name,
    localitySlug: tx.locality.slug,
    projectId: tx.projectId,
    projectName: tx.project?.name ?? null,
    projectSlug: projectVisible ? tx.project!.slug : null,
    projectStatus: tx.project?.status ?? null,
    propertyCategory: tx.project?.category ?? null,
    builderName: tx.project?.builder?.name ?? null,
    builderSlug: builderVisible ? tx.project!.builder!.slug : null,
    builderLogoUrl: tx.project?.builder?.logoUrl ?? null,
  };
}

export type PublicTransaction = ReturnType<typeof mapPublicTransaction>;

export interface PublicTransactionFilters {
  q?: string;
  localityId?: string;
  builderId?: string;
  projectId?: string;
  category?: string;
  bedrooms?: string;
  priceMinRupees?: number;
  priceMaxRupees?: number;
  areaMinSqft?: number;
  areaMaxSqft?: number;
  dateFrom?: string;
  dateTo?: string;
  type?: string;
  readiness?: string; // "ready" | "under_construction"
  sortBy?: string;
  page?: number;
  pageSize?: number;
}

const TX_READY_STATUSES = ["READY_TO_MOVE", "DELIVERED"] as const;
const TX_UNDER_CONSTRUCTION_STATUSES = ["ANNOUNCED", "PRE_LAUNCH", "UNDER_CONSTRUCTION", "NEARING_POSSESSION", "STALLED"] as const;

function transactionBedroomsFilter(bedrooms: string | undefined) {
  if (!bedrooms) return undefined;
  const n = Number(bedrooms);
  if (!Number.isFinite(n)) return undefined;
  return n >= 4 ? { gte: 4 } : { gte: n, lt: n + 1 };
}

function buildTransactionWhere(filters: PublicTransactionFilters): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {
    locality: { city: { slug: PRIMARY_CITY_SLUG } },
    deletedAt: null,
  };
  if (filters.q) {
    where.OR = [
      { project: { name: { contains: filters.q, mode: "insensitive" } } },
      { project: { builder: { name: { contains: filters.q, mode: "insensitive" } } } },
      { locality: { name: { contains: filters.q, mode: "insensitive" } } },
    ];
  }
  if (filters.localityId) where.localityId = filters.localityId;
  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.builderId || filters.category || filters.readiness) {
    where.project = {
      ...(filters.builderId ? { builderId: filters.builderId } : {}),
      ...(filters.category ? { category: filters.category as Prisma.ProjectWhereInput["category"] } : {}),
      ...(filters.readiness === "ready" ? { status: { in: [...TX_READY_STATUSES] } } : {}),
      ...(filters.readiness === "under_construction" ? { status: { in: [...TX_UNDER_CONSTRUCTION_STATUSES] } } : {}),
    };
  }
  const bedroomsFilter = transactionBedroomsFilter(filters.bedrooms);
  if (bedroomsFilter) where.bedrooms = bedroomsFilter;
  if (filters.type === "sale") where.type = { in: ["SALE", "RESALE"] };
  else if (filters.type === "rental") where.type = "LEASE";
  else if (filters.type) where.type = filters.type as Prisma.TransactionWhereInput["type"];
  if (filters.priceMinRupees !== undefined || filters.priceMaxRupees !== undefined) {
    where.valuePaise = {
      ...(filters.priceMinRupees !== undefined ? { gte: BigInt(Math.round(filters.priceMinRupees * 100)) } : {}),
      ...(filters.priceMaxRupees !== undefined ? { lte: BigInt(Math.round(filters.priceMaxRupees * 100)) } : {}),
    };
  }
  if (filters.areaMinSqft !== undefined || filters.areaMaxSqft !== undefined) {
    where.carpetSqft = {
      ...(filters.areaMinSqft !== undefined ? { gte: filters.areaMinSqft } : {}),
      ...(filters.areaMaxSqft !== undefined ? { lte: filters.areaMaxSqft } : {}),
    };
  }
  if (filters.dateFrom || filters.dateTo) {
    where.registrationDate = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59`) } : {}),
    };
  }
  return where;
}

function publicTransactionOrderBy(sortBy: string | undefined): Prisma.TransactionOrderByWithRelationInput {
  switch (sortBy) {
    case "price_desc":
      return { valuePaise: "desc" };
    case "price_asc":
      return { valuePaise: "asc" };
    case "ppsf_desc":
      return { pricePerSqftPaise: { sort: "desc", nulls: "last" } };
    default:
      return { registrationDate: "desc" };
  }
}

export async function getPublicTransactionsPaged(filters: PublicTransactionFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, filters.pageSize ?? 20));
  const where = buildTransactionWhere(filters);

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: publicTransactionOrderBy(filters.sortBy),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: PUBLIC_TRANSACTION_INCLUDE,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    items: items.map(mapPublicTransaction),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type { TransactionStats, TransactionMonthlyPoint, ConfigurationBucket, PropertyTypeBucket } from "@/lib/analytics";

/** Fetches the raw rows; every statistic is computed by TransactionAnalyticsService. */
export async function getTransactionStats(filters: PublicTransactionFilters = {}) {
  const where = buildTransactionWhere(filters);
  const rows = await prisma.transaction.findMany({
    where,
    select: { valuePaise: true, pricePerSqftPaise: true, carpetSqft: true },
  });
  return TransactionAnalyticsService.calculateStats(rows);
}

export async function getTransactionMonthlyTrend(filters: PublicTransactionFilters = {}, months = 12) {
  const where = buildTransactionWhere(filters);
  if (!filters.dateFrom && !filters.dateTo) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    where.registrationDate = { gte: since };
  }

  const rows = await prisma.transaction.findMany({
    where,
    select: { registrationDate: true, valuePaise: true, pricePerSqftPaise: true },
    orderBy: { registrationDate: "asc" },
  });
  return TransactionAnalyticsService.calculateMonthlyTrend(rows);
}

export async function getTransactionConfigurationDistribution(filters: PublicTransactionFilters = {}) {
  const where = buildTransactionWhere(filters);
  if (!where.bedrooms) where.bedrooms = { not: null };
  const rows = await prisma.transaction.findMany({
    where,
    select: { bedrooms: true },
  });
  return TransactionAnalyticsService.calculateConfigurationDistribution(rows.filter((r): r is { bedrooms: NonNullable<typeof r.bedrooms> } => r.bedrooms !== null));
}

export async function getTransactionPropertyTypeDistribution(filters: PublicTransactionFilters = {}) {
  const where = buildTransactionWhere(filters);
  const rows = await prisma.transaction.findMany({
    where,
    select: { project: { select: { category: true } } },
  });
  return TransactionAnalyticsService.calculatePropertyTypeDistribution(rows.map((r) => ({ category: r.project?.category ?? null })));
}

/** cache()-wrapped: generateMetadata and the page component both fetch this per request — dedupe to one query. */
export const getPublicTransactionById = cache(async (id: string): Promise<PublicTransaction | null> => {
  const tx = await prisma.transaction.findFirst({
    where: { id, locality: { city: { slug: PRIMARY_CITY_SLUG } }, deletedAt: null },
    include: PUBLIC_TRANSACTION_INCLUDE,
  });
  return tx ? mapPublicTransaction(tx) : null;
});

export async function getRelatedTransactions(
  tx: { id: string; projectId: string | null; localityId: string; bedrooms: number | null },
  limit = 6
): Promise<{ history: PublicTransaction[]; similar: PublicTransaction[] }> {
  const [history, similar] = await Promise.all([
    tx.projectId
      ? prisma.transaction.findMany({
          where: { projectId: tx.projectId, id: { not: tx.id }, deletedAt: null },
          orderBy: { registrationDate: "desc" },
          take: limit,
          include: PUBLIC_TRANSACTION_INCLUDE,
        })
      : Promise.resolve([]),
    prisma.transaction.findMany({
      where: {
        localityId: tx.localityId,
        id: { not: tx.id },
        deletedAt: null,
        ...(tx.bedrooms !== null ? { bedrooms: { gte: tx.bedrooms - 0.5, lte: tx.bedrooms + 0.5 } } : {}),
      },
      orderBy: { registrationDate: "desc" },
      take: limit,
      include: PUBLIC_TRANSACTION_INCLUDE,
    }),
  ]);

  return { history: history.map(mapPublicTransaction), similar: similar.map(mapPublicTransaction) };
}
