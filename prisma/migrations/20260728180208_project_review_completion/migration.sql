-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "completionPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "submittedForReviewAt" TIMESTAMP(3);

