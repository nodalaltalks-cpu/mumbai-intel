-- CreateEnum
CREATE TYPE "NewsletterStatus" AS ENUM ('SUBSCRIBED', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "ResearchEventType" AS ENUM ('PROJECT_VIEWED', 'BUILDER_VIEWED', 'LOCALITY_VIEWED', 'SEARCH_PERFORMED', 'FILTERS_USED', 'COMPARE_USED', 'WISHLIST_ADDED', 'CONTINUE_RESEARCH_CLICKED', 'PROFILE_VIEWED', 'PROFILE_UPDATED', 'NEWSLETTER_VIEWED', 'NEWSLETTER_SUBSCRIBED', 'NEWSLETTER_UNSUBSCRIBED');

-- AlterTable
ALTER TABLE "PublicUser" ADD COLUMN     "profileCompletionPercent" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "NewsletterStatus" NOT NULL DEFAULT 'SUBSCRIBED',
    "publicUserId" TEXT,
    "source" TEXT,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchEvent" (
    "id" TEXT NOT NULL,
    "eventType" "ResearchEventType" NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "publicUserId" TEXT,
    "sessionId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_publicUserId_key" ON "NewsletterSubscriber"("publicUserId");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_status_idx" ON "NewsletterSubscriber"("status");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_subscribedAt_idx" ON "NewsletterSubscriber"("subscribedAt");

-- CreateIndex
CREATE INDEX "ResearchEvent_eventType_createdAt_idx" ON "ResearchEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchEvent_entityType_entityId_idx" ON "ResearchEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ResearchEvent_publicUserId_idx" ON "ResearchEvent"("publicUserId");

-- AddForeignKey
ALTER TABLE "NewsletterSubscriber" ADD CONSTRAINT "NewsletterSubscriber_publicUserId_fkey" FOREIGN KEY ("publicUserId") REFERENCES "PublicUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchEvent" ADD CONSTRAINT "ResearchEvent_publicUserId_fkey" FOREIGN KEY ("publicUserId") REFERENCES "PublicUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

