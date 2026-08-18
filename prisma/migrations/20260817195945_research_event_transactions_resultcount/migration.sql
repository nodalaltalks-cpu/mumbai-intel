-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ResearchEventType" ADD VALUE 'TRANSACTION_LIST_VIEWED';
ALTER TYPE "ResearchEventType" ADD VALUE 'TRANSACTION_SEARCHED';
ALTER TYPE "ResearchEventType" ADD VALUE 'TRANSACTION_FILTER_APPLIED';

-- AlterTable
ALTER TABLE "ResearchEvent" ADD COLUMN     "resultCount" INTEGER;
