-- AlterTable
ALTER TABLE "ContactEnquiry" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "EmailCampaign" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "ContactEnquiry_deletedAt_idx" ON "ContactEnquiry"("deletedAt");

-- CreateIndex
CREATE INDEX "EmailCampaign_deletedAt_idx" ON "EmailCampaign"("deletedAt");
