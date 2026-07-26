-- CreateTable
CREATE TABLE "SavedProject" (
    "id" TEXT NOT NULL,
    "publicUserId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedProject_publicUserId_idx" ON "SavedProject"("publicUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedProject_publicUserId_projectId_key" ON "SavedProject"("publicUserId", "projectId");

-- AddForeignKey
ALTER TABLE "SavedProject" ADD CONSTRAINT "SavedProject_publicUserId_fkey" FOREIGN KEY ("publicUserId") REFERENCES "PublicUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedProject" ADD CONSTRAINT "SavedProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
