-- CreateEnum
CREATE TYPE "PlatformLoadState" AS ENUM ('NORMAL', 'WATCH', 'WARNING', 'CRITICAL');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_PLATFORM_CAPACITY_WARNING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ResearchEventType" ADD VALUE 'RECOMMENDATION_IMPRESSION';
ALTER TYPE "ResearchEventType" ADD VALUE 'RECOMMENDATION_CLICKED';

-- CreateTable
CREATE TABLE "PresenceHeartbeat" (
    "id" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "publicUserId" TEXT,
    "isAnonymous" BOOLEAN NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PresenceHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformMetricSnapshot" (
    "id" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeNow" INTEGER NOT NULL,
    "active5m" INTEGER NOT NULL,
    "active30m" INTEGER NOT NULL,
    "activeToday" INTEGER NOT NULL,
    "anonymousActiveNow" INTEGER NOT NULL,
    "registeredActiveNow" INTEGER NOT NULL,
    "dbSampleCount" INTEGER NOT NULL,
    "dbAvgResponseMs" DOUBLE PRECISION,
    "dbP95ResponseMs" DOUBLE PRECISION,
    "dbP99ResponseMs" DOUBLE PRECISION,
    "dbErrorCount" INTEGER NOT NULL,
    "activityEventCount" INTEGER NOT NULL,
    "loadState" "PlatformLoadState" NOT NULL,
    "primaryBottleneck" TEXT,
    "bottleneckReason" TEXT,

    CONSTRAINT "PlatformMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PresenceHeartbeat_subjectKey_key" ON "PresenceHeartbeat"("subjectKey");

-- CreateIndex
CREATE UNIQUE INDEX "PresenceHeartbeat_publicUserId_key" ON "PresenceHeartbeat"("publicUserId");

-- CreateIndex
CREATE INDEX "PresenceHeartbeat_lastSeenAt_idx" ON "PresenceHeartbeat"("lastSeenAt");

-- CreateIndex
CREATE INDEX "PresenceHeartbeat_publicUserId_idx" ON "PresenceHeartbeat"("publicUserId");

-- CreateIndex
CREATE INDEX "PlatformMetricSnapshot_capturedAt_idx" ON "PlatformMetricSnapshot"("capturedAt");

-- AddForeignKey
ALTER TABLE "PresenceHeartbeat" ADD CONSTRAINT "PresenceHeartbeat_publicUserId_fkey" FOREIGN KEY ("publicUserId") REFERENCES "PublicUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
