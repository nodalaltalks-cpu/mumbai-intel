-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'RESOLVED');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "famousLandmark" TEXT;

-- CreateTable
CREATE TABLE "ProjectPaymentMilestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "percentage" DECIMAL(5,2),
    "amountPaise" BIGINT,
    "isCustom" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectPaymentMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "entityName" TEXT NOT NULL,
    "entityUrl" TEXT NOT NULL,
    "category" TEXT,
    "issue" TEXT NOT NULL,
    "suggestedValue" TEXT,
    "reporterUserId" TEXT,
    "reporterEmail" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'NEW',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectPaymentMilestone_projectId_sortOrder_idx" ON "ProjectPaymentMilestone"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "Report_entityType_entityId_idx" ON "Report"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectPaymentMilestone" ADD CONSTRAINT "ProjectPaymentMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
