-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('NEW_LAUNCH', 'PRICE_OFFER', 'TRENDING_LOCALITY', 'NEW_REPORT', 'MARKET_INSIGHT', 'TRANSACTION_DATA', 'SAVED_SEARCH_ANNOUNCEMENT', 'PRODUCT_UPDATE', 'GENERAL_UPDATE');

-- CreateEnum
CREATE TYPE "NotificationCampaignStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED');

-- AlterEnum
ALTER TYPE "ResearchEventType" ADD VALUE 'NOTIFICATION_CLICKED';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "clickedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "NotificationCampaign" (
    "id" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "imageUrl" TEXT,
    "actionLabel" TEXT,
    "actionUrl" TEXT,
    "targetFilters" JSONB,
    "status" "NotificationCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationCampaign_status_createdAt_idx" ON "NotificationCampaign"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_campaignId_idx" ON "Notification"("campaignId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "NotificationCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationCampaign" ADD CONSTRAINT "NotificationCampaign_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
