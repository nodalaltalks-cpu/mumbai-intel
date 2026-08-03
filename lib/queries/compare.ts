import { prisma } from "@/lib/prisma";
import { formatDate, formatPriceBand, formatPricePerSqft, formatSqft } from "@/lib/format";
import { CATEGORY_LABEL, pickCardImageUrl, STATUS_LABEL, type ProjectStatus, type PropertyCategory } from "@/lib/project-meta";

/**
 * Public "Compare Projects" read layer — a third, distinct read boundary
 * (like lib/queries/dashboard.ts) since it fetches by an anonymous,
 * client-supplied slug list rather than a signed-in user's own data.
 */
export interface CompareProject {
  slug: string;
  name: string;
  imageUrl: string | null;
  builderName: string | null;
  localityName: string;
  status: string;
  category: string;
  priceLabel: string;
  pricePerSqftLabel: string | null;
  configurationLabels: string[];
  areaLabel: string | null;
  totalUnits: number | null;
  constructionPercent: number | null;
  possessionLabel: string;
  reraNumber: string | null;
  amenityCount: number;
  brochureUrl: string | null;
  brochureFileName: string | null;
  brochureThumbnailUrl: string | null;
}

export async function getProjectsForCompare(slugs: string[]): Promise<CompareProject[]> {
  if (slugs.length === 0) return [];

  // `select` (not `include`) — only the fields the mapped row below reads;
  // `amenities` only ever needs a count, not the full join rows.
  const projects = await prisma.project.findMany({
    where: { slug: { in: slugs }, isPublished: true, isArchived: false },
    select: {
      slug: true,
      name: true,
      status: true,
      category: true,
      priceMinPaise: true,
      priceMaxPaise: true,
      totalUnits: true,
      constructionPercent: true,
      actualPossession: true,
      promisedPossession: true,
      reraNumber: true,
      brochureUrl: true,
      brochureFileName: true,
      brochureThumbnailUrl: true,
      builder: { select: { name: true } },
      locality: { select: { name: true } },
      images: { orderBy: { sortOrder: "asc" }, take: 8, select: { url: true, kind: true } },
      configurations: { orderBy: { sortOrder: "asc" }, select: { carpetSqft: true, priceMinPaise: true, label: true } },
      _count: { select: { amenities: true } },
    },
  });

  const bySlug = new Map(projects.map((p) => [p.slug, p]));
  // Preserve the caller's slug order (the order the user added them to Compare).
  return slugs
    .map((slug) => bySlug.get(slug))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)
    .map((project) => {
      const carpetAreas = project.configurations.map((c) => c.carpetSqft).filter((n): n is NonNullable<typeof n> => n !== null);
      const minArea = carpetAreas.length ? Math.min(...carpetAreas.map(Number)) : null;
      const maxArea = carpetAreas.length ? Math.max(...carpetAreas.map(Number)) : null;

      return {
        slug: project.slug,
        name: project.name,
        imageUrl: pickCardImageUrl(project.images),
        builderName: project.builder?.name ?? null,
        localityName: project.locality.name,
        status: STATUS_LABEL[project.status as ProjectStatus],
        category: CATEGORY_LABEL[project.category as PropertyCategory],
        priceLabel: formatPriceBand(
          project.priceMinPaise !== null ? Number(project.priceMinPaise) : null,
          project.priceMaxPaise !== null ? Number(project.priceMaxPaise) : null
        ),
        pricePerSqftLabel: (() => {
          const bands = project.configurations
            .map((c) => (c.priceMinPaise !== null && c.carpetSqft !== null ? Number(c.priceMinPaise) / Number(c.carpetSqft) : null))
            .filter((n): n is number => n !== null);
          if (bands.length === 0) return null;
          return formatPricePerSqft(Math.round(bands.reduce((a, b) => a + b, 0) / bands.length));
        })(),
        configurationLabels: [...new Set(project.configurations.map((c) => c.label))],
        areaLabel: minArea !== null && maxArea !== null ? (minArea === maxArea ? formatSqft(minArea) : `${formatSqft(minArea)} – ${formatSqft(maxArea)}`) : null,
        totalUnits: project.totalUnits,
        constructionPercent: project.constructionPercent,
        possessionLabel: project.actualPossession
          ? `Ready (${formatDate(project.actualPossession)})`
          : project.promisedPossession
            ? formatDate(project.promisedPossession)
            : "--",
        reraNumber: project.reraNumber,
        amenityCount: project._count.amenities,
        brochureUrl: project.brochureUrl,
        brochureFileName: project.brochureFileName,
        brochureThumbnailUrl: project.brochureThumbnailUrl,
      };
    });
}
