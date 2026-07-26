-- AlterTable
ALTER TABLE "Builder" ADD COLUMN     "coverImageUrl" TEXT,
ADD COLUMN     "metaDescription" TEXT,
ADD COLUMN     "metaTitle" TEXT,
ADD COLUMN     "ogImageUrl" TEXT;

-- CreateTable
CREATE TABLE "BuilderAmenity" (
    "id" TEXT NOT NULL,
    "builderId" TEXT NOT NULL,
    "amenityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuilderAmenity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuilderImage" (
    "id" TEXT NOT NULL,
    "builderId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuilderImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuilderAmenity_amenityId_idx" ON "BuilderAmenity"("amenityId");

-- CreateIndex
CREATE UNIQUE INDEX "BuilderAmenity_builderId_amenityId_key" ON "BuilderAmenity"("builderId", "amenityId");

-- CreateIndex
CREATE INDEX "BuilderImage_builderId_sortOrder_idx" ON "BuilderImage"("builderId", "sortOrder");

-- AddForeignKey
ALTER TABLE "BuilderAmenity" ADD CONSTRAINT "BuilderAmenity_builderId_fkey" FOREIGN KEY ("builderId") REFERENCES "Builder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuilderAmenity" ADD CONSTRAINT "BuilderAmenity_amenityId_fkey" FOREIGN KEY ("amenityId") REFERENCES "Amenity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuilderImage" ADD CONSTRAINT "BuilderImage_builderId_fkey" FOREIGN KEY ("builderId") REFERENCES "Builder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
