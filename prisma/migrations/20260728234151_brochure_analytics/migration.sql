-- CreateTable
CREATE TABLE "BrochureDownloadEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "builderId" TEXT,
    "localityId" TEXT,
    "microMarketId" TEXT,
    "eventType" TEXT NOT NULL,
    "isRepeat" BOOLEAN NOT NULL DEFAULT false,
    "publicUserId" TEXT,
    "sessionId" TEXT,
    "ipAddress" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "country" TEXT,
    "city" TEXT,
    "referrer" TEXT,
    "landingPage" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrochureDownloadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrochureDownloadEvent_projectId_createdAt_idx" ON "BrochureDownloadEvent"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "BrochureDownloadEvent_builderId_createdAt_idx" ON "BrochureDownloadEvent"("builderId", "createdAt");

-- CreateIndex
CREATE INDEX "BrochureDownloadEvent_localityId_createdAt_idx" ON "BrochureDownloadEvent"("localityId", "createdAt");

-- CreateIndex
CREATE INDEX "BrochureDownloadEvent_microMarketId_createdAt_idx" ON "BrochureDownloadEvent"("microMarketId", "createdAt");

-- CreateIndex
CREATE INDEX "BrochureDownloadEvent_eventType_createdAt_idx" ON "BrochureDownloadEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "BrochureDownloadEvent_publicUserId_idx" ON "BrochureDownloadEvent"("publicUserId");

-- CreateIndex
CREATE INDEX "BrochureDownloadEvent_sessionId_idx" ON "BrochureDownloadEvent"("sessionId");

-- AddForeignKey
ALTER TABLE "BrochureDownloadEvent" ADD CONSTRAINT "BrochureDownloadEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

