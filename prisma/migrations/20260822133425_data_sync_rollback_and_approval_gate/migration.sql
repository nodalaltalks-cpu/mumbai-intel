-- AlterTable
ALTER TABLE "IngestStagingRecord" ADD COLUMN     "appliedEntityId" TEXT,
ADD COLUMN     "rolledBackAt" TIMESTAMP(3),
ADD COLUMN     "rolledBackByUserId" TEXT;
