-- CreateEnum
CREATE TYPE "RecommendationModelStatus" AS ENUM ('INSUFFICIENT_DATA', 'TRAINING', 'EVALUATED', 'SHADOW', 'ACTIVE', 'ARCHIVED', 'FAILED');

-- CreateTable
CREATE TABLE "RecommendationModelVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "modelType" TEXT NOT NULL,
    "status" "RecommendationModelStatus" NOT NULL,
    "trainingPeriodStart" TIMESTAMP(3),
    "trainingPeriodEnd" TIMESTAMP(3),
    "datasetSize" INTEGER NOT NULL,
    "interactionCount" INTEGER NOT NULL,
    "distinctUserCount" INTEGER NOT NULL,
    "distinctProjectCount" INTEGER NOT NULL,
    "featureVersion" TEXT NOT NULL,
    "weightsJson" JSONB,
    "metricsJson" JSONB,
    "trainedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trainedByUserId" TEXT,
    "notes" TEXT,

    CONSTRAINT "RecommendationModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecommendationModelVersion_status_idx" ON "RecommendationModelVersion"("status");

-- CreateIndex
CREATE INDEX "RecommendationModelVersion_trainedAt_idx" ON "RecommendationModelVersion"("trainedAt");

-- AddForeignKey
ALTER TABLE "RecommendationModelVersion" ADD CONSTRAINT "RecommendationModelVersion_trainedByUserId_fkey" FOREIGN KEY ("trainedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
