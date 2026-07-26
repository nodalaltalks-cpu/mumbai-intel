/*
  Warnings:

  - You are about to drop the column `blurb` on the `Locality` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InfraType" ADD VALUE 'PARK';
ALTER TYPE "InfraType" ADD VALUE 'RESTAURANT';

-- AlterTable
ALTER TABLE "Locality" DROP COLUMN "blurb",
ADD COLUMN     "advantages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "canonicalUrl" TEXT,
ADD COLUMN     "connectivityNotes" TEXT,
ADD COLUMN     "coverImageUrl" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "disadvantages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "endUserScore" DECIMAL(3,1),
ADD COLUMN     "familyScore" DECIMAL(3,1),
ADD COLUMN     "investmentScore" DECIMAL(3,1),
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "luxuryScore" DECIMAL(3,1),
ADD COLUMN     "metaDescription" TEXT,
ADD COLUMN     "metaTitle" TEXT,
ADD COLUMN     "ogImageUrl" TEXT;

-- CreateTable
CREATE TABLE "LocalityAmenity" (
    "id" TEXT NOT NULL,
    "localityId" TEXT NOT NULL,
    "amenityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalityAmenity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalityImage" (
    "id" TEXT NOT NULL,
    "localityId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalityImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocalityAmenity_amenityId_idx" ON "LocalityAmenity"("amenityId");

-- CreateIndex
CREATE UNIQUE INDEX "LocalityAmenity_localityId_amenityId_key" ON "LocalityAmenity"("localityId", "amenityId");

-- CreateIndex
CREATE INDEX "LocalityImage_localityId_sortOrder_idx" ON "LocalityImage"("localityId", "sortOrder");

-- CreateIndex
CREATE INDEX "Locality_isPublished_idx" ON "Locality"("isPublished");

-- CreateIndex
CREATE INDEX "Locality_isArchived_idx" ON "Locality"("isArchived");

-- AddForeignKey
ALTER TABLE "LocalityAmenity" ADD CONSTRAINT "LocalityAmenity_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalityAmenity" ADD CONSTRAINT "LocalityAmenity_amenityId_fkey" FOREIGN KEY ("amenityId") REFERENCES "Amenity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalityImage" ADD CONSTRAINT "LocalityImage_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE CASCADE ON UPDATE CASCADE;
