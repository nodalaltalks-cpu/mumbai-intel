import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { PRIMARY_CITY_SLUG } from "@/lib/queries/shared";

const STATIC_ROUTES = [
  "/",
  "/projects",
  "/builders",
  "/localities",
  "/transactions",
  "/map",
  "/reports",
  "/reports/market",
  "/reports/transactions",
  "/market-data",
  "/insights",
  "/login",
  "/signup",
  "/about",
  "/contact",
  "/faq",
  "/help",
  "/terms",
  "/privacy",
  "/cookie-policy",
  "/disclaimer",
];

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

export const revalidate = 3600;

/** Every published, non-archived catalog entity plus the static top-level routes — nothing hardcoded, regenerated hourly. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = baseUrl();

  const [projects, builders, localities] = await Promise.all([
    prisma.project.findMany({
      where: { city: { slug: PRIMARY_CITY_SLUG }, isPublished: true, isArchived: false },
      select: { slug: true, updatedAt: true },
    }),
    prisma.builder.findMany({
      where: { isPublished: true, isArchived: false },
      select: { slug: true, updatedAt: true },
    }),
    prisma.locality.findMany({
      where: { city: { slug: PRIMARY_CITY_SLUG }, isPublished: true, isArchived: false },
      select: { slug: true, updatedAt: true },
    }),
  ]);

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${site}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));

  const projectEntries: MetadataRoute.Sitemap = projects.map((p) => ({
    url: `${site}/projects/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));
  const builderEntries: MetadataRoute.Sitemap = builders.map((b) => ({
    url: `${site}/builders/${b.slug}`,
    lastModified: b.updatedAt,
    changeFrequency: "weekly",
    priority: 0.6,
  }));
  const localityEntries: MetadataRoute.Sitemap = localities.map((l) => ({
    url: `${site}/localities/${l.slug}`,
    lastModified: l.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticEntries, ...projectEntries, ...builderEntries, ...localityEntries];
}
