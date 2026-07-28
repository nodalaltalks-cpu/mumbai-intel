-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "brochureFileName" TEXT,
ADD COLUMN     "brochureFileSize" INTEGER,
ADD COLUMN     "brochureMimeType" TEXT,
ADD COLUMN     "brochureUploadedAt" TIMESTAMP(3),
ADD COLUMN     "brochureUploadedBy" TEXT,
ADD COLUMN     "brochureVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProjectBrochureVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedByUserId" TEXT,

    CONSTRAINT "ProjectBrochureVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectBrochureVersion_projectId_version_idx" ON "ProjectBrochureVersion"("projectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBrochureVersion_projectId_version_key" ON "ProjectBrochureVersion"("projectId", "version");

-- AddForeignKey
ALTER TABLE "ProjectBrochureVersion" ADD CONSTRAINT "ProjectBrochureVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

