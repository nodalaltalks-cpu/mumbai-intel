-- AlterTable
ALTER TABLE "Amenity" ADD COLUMN     "projectId" TEXT;

-- CreateIndex
CREATE INDEX "Amenity_projectId_idx" ON "Amenity"("projectId");

-- AddForeignKey
ALTER TABLE "Amenity" ADD CONSTRAINT "Amenity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
