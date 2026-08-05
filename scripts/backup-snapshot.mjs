import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import "dotenv/config";

/**
 * Full read-only export of every manually-curated content table (localities,
 * builders, projects + all their nested media/specs/history, transactions,
 * admin users) to a single timestamped JSON file under /backups.
 *
 * This is an independent safety net on top of Neon's own point-in-time
 * recovery — a local copy you can keep, diff, or manually restore from if a
 * bad edit ever needs to be undone. Purely additive: makes no writes, adds
 * no dependency, touches no existing app code.
 *
 * Run before/after any big manual data-entry session:
 *   npm run backup
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [
    countries,
    states,
    cities,
    zones,
    localities,
    localityAmenities,
    localityImages,
    localityAliases,
    microMarkets,
    builders,
    builderAmenities,
    builderImages,
    builderTimelineEvents,
    builderScoreSnapshots,
    projects,
    transactions,
    infraAssets,
    amenities,
    adminUsers,
    auditLogs,
  ] = await Promise.all([
    prisma.country.findMany(),
    prisma.state.findMany(),
    prisma.city.findMany(),
    prisma.zone.findMany(),
    prisma.locality.findMany(),
    prisma.localityAmenity.findMany(),
    prisma.localityImage.findMany(),
    prisma.localityAlias.findMany(),
    prisma.microMarket.findMany(),
    prisma.builder.findMany(),
    prisma.builderAmenity.findMany(),
    prisma.builderImage.findMany(),
    prisma.builderTimelineEvent.findMany(),
    prisma.builderScoreSnapshot.findMany(),
    prisma.project.findMany({
      include: {
        images: true,
        configurations: true,
        amenities: true,
        priceHistory: true,
        infraLinks: true,
        metrics: true,
        investmentNotes: true,
        specifications: true,
        documents: true,
        timelineEvents: true,
        faqs: true,
        sections: true,
        brochureVersions: true,
      },
    }),
    prisma.transaction.findMany(),
    prisma.infraAsset.findMany(),
    prisma.amenity.findMany(),
    // Never write password hashes to a file on disk.
    prisma.user.findMany({ select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true, createdAt: true, updatedAt: true } }),
    prisma.auditLog.findMany(),
  ]);

  const snapshot = {
    exportedAt: new Date().toISOString(),
    counts: {
      countries: countries.length,
      states: states.length,
      cities: cities.length,
      zones: zones.length,
      localities: localities.length,
      localityAmenities: localityAmenities.length,
      localityImages: localityImages.length,
      localityAliases: localityAliases.length,
      microMarkets: microMarkets.length,
      builders: builders.length,
      builderAmenities: builderAmenities.length,
      builderImages: builderImages.length,
      builderTimelineEvents: builderTimelineEvents.length,
      builderScoreSnapshots: builderScoreSnapshots.length,
      projects: projects.length,
      transactions: transactions.length,
      infraAssets: infraAssets.length,
      amenities: amenities.length,
      adminUsers: adminUsers.length,
      auditLogs: auditLogs.length,
    },
    data: {
      countries,
      states,
      cities,
      zones,
      localities,
      localityAmenities,
      localityImages,
      localityAliases,
      microMarkets,
      builders,
      builderAmenities,
      builderImages,
      builderTimelineEvents,
      builderScoreSnapshots,
      projects,
      transactions,
      infraAssets,
      amenities,
      adminUsers,
      auditLogs,
    },
  };

  const backupsDir = path.join(__dirname, "..", "backups");
  await mkdir(backupsDir, { recursive: true });

  const stamp = snapshot.exportedAt.replace(/[:.]/g, "-");
  const outPath = path.join(backupsDir, `snapshot-${stamp}.json`);

  // BigInt fields (priceMinPaise, priceMaxPaise, etc.) don't survive JSON.stringify by default.
  const json = JSON.stringify(snapshot, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2);
  await writeFile(outPath, json, "utf8");

  console.log(`Backup written to ${outPath}`);
  console.table(snapshot.counts);
}

main()
  .catch((error) => {
    console.error("Backup failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
