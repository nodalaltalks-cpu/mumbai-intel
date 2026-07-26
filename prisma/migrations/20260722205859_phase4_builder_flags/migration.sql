-- AlterTable
ALTER TABLE "Builder" ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Builder_isPublished_idx" ON "Builder"("isPublished");

-- CreateIndex
CREATE INDEX "Builder_isArchived_idx" ON "Builder"("isArchived");
