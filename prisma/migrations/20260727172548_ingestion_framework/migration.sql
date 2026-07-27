-- AlterEnum
ALTER TYPE "DataSource" ADD VALUE 'EXTERNAL_OPEN_DATA';

-- AlterTable
ALTER TABLE "InfraAsset" ADD COLUMN     "ingestBatchId" TEXT,
ADD COLUMN     "sourceRef" TEXT;

-- AlterTable
ALTER TABLE "IngestBatch" ADD COLUMN     "recordsFailed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "recordsSkipped" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trigger" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "triggeredByUserId" TEXT;

-- CreateTable
CREATE TABLE "IngestSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scheduleCron" TEXT,
    "config" JSONB,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestLogEntry" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestStagingRecord" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "targetId" TEXT,
    "payload" JSONB NOT NULL,
    "matchedExistingId" TEXT,
    "matchConfidence" DECIMAL(4,3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestStagingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngestSource_key_key" ON "IngestSource"("key");

-- CreateIndex
CREATE INDEX "IngestLogEntry_batchId_idx" ON "IngestLogEntry"("batchId");

-- CreateIndex
CREATE INDEX "IngestStagingRecord_status_createdAt_idx" ON "IngestStagingRecord"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InfraAsset_sourceRef_key" ON "InfraAsset"("sourceRef");

-- AddForeignKey
ALTER TABLE "IngestLogEntry" ADD CONSTRAINT "IngestLogEntry_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "IngestBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestStagingRecord" ADD CONSTRAINT "IngestStagingRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "IngestBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

