-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "NotificationCampaign" ADD COLUMN     "customCategory" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "trashPasswordHash" TEXT;
