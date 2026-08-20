
-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_STORAGE_WARNING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ResearchEventType" ADD VALUE 'WHATSAPP_SHARE_CLICKED';
ALTER TYPE "ResearchEventType" ADD VALUE 'REFERRAL_SHARE_INITIATED';
ALTER TYPE "ResearchEventType" ADD VALUE 'REFERRAL_LINK_CLICKED';

-- AlterTable
ALTER TABLE "PublicUser" ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referralSource" TEXT,
ADD COLUMN     "referredByUserId" TEXT;

-- CreateTable
CREATE TABLE "StorageSnapshot" (
    "id" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dbSizeBytes" BIGINT,
    "cloudinaryStorageBytes" BIGINT,
    "cloudinaryObjectCount" INTEGER,
    "cloudinaryCreditsUsedPercent" DECIMAL(5,2),

    CONSTRAINT "StorageSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorageSnapshot_capturedAt_idx" ON "StorageSnapshot"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublicUser_referralCode_key" ON "PublicUser"("referralCode");

-- CreateIndex
CREATE INDEX "PublicUser_referredByUserId_idx" ON "PublicUser"("referredByUserId");

-- AddForeignKey
ALTER TABLE "PublicUser" ADD CONSTRAINT "PublicUser_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "PublicUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

