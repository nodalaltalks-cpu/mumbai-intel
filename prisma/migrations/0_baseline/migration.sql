-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('OFFICIAL_GOVERNMENT', 'BUILDER_INFORMATION', 'MANUALLY_VERIFIED', 'AI_GENERATED', 'USER_SUBMITTED');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ANNOUNCED', 'PRE_LAUNCH', 'UNDER_CONSTRUCTION', 'NEARING_POSSESSION', 'READY_TO_MOVE', 'DELIVERED', 'STALLED');

-- CreateEnum
CREATE TYPE "PropertyCategory" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'PLOT', 'MIXED_USE');

-- CreateEnum
CREATE TYPE "AmenityCategory" AS ENUM ('RECREATION', 'SAFETY', 'CONVENIENCE', 'WELLNESS', 'UTILITIES', 'OUTDOOR');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('SALE', 'RESALE', 'LEASE');

-- CreateEnum
CREATE TYPE "InfraType" AS ENUM ('METRO_STATION', 'RAILWAY_STATION', 'SCHOOL', 'HOSPITAL', 'MALL', 'AIRPORT', 'ROAD', 'BUSINESS_DISTRICT');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- CreateTable
CREATE TABLE "Country" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iso2" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "State" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "reraPortalUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "centroidLat" DOUBLE PRECISION,
    "centroidLng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Locality" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "zoneId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "pincode" TEXT,
    "blurb" TEXT,
    "centroidLat" DOUBLE PRECISION,
    "centroidLng" DOUBLE PRECISION,
    "avgPricePerSqftPaise" BIGINT,
    "rentalYieldPercent" DECIMAL(5,2),
    "growthPercentYoy" DECIMAL(5,2),
    "marketDataSource" "DataSource",
    "marketAsOf" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Locality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalityAlias" (
    "id" TEXT NOT NULL,
    "localityId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalityAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicroMarket" (
    "id" TEXT NOT NULL,
    "localityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicroMarket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Builder" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "logoUrl" TEXT,
    "description" TEXT,
    "foundedYear" INTEGER,
    "headquarters" TEXT,
    "websiteUrl" TEXT,
    "reraNumber" TEXT,
    "awards" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dataSource" "DataSource" NOT NULL DEFAULT 'MANUALLY_VERIFIED',
    "confidence" "Confidence" NOT NULL DEFAULT 'HIGH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Builder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuilderTimelineEvent" (
    "id" TEXT NOT NULL,
    "builderId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuilderTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuilderScoreSnapshot" (
    "id" TEXT NOT NULL,
    "builderId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "overallScore" DECIMAL(4,2) NOT NULL,
    "onTimeDeliveryPct" DECIMAL(5,2),
    "avgDelayMonths" DECIMAL(5,1),
    "deliveredProjects" INTEGER NOT NULL DEFAULT 0,
    "activeProjects" INTEGER NOT NULL DEFAULT 0,
    "litigationFlags" INTEGER NOT NULL DEFAULT 0,
    "methodologyVersion" TEXT NOT NULL,
    "dataSource" "DataSource" NOT NULL DEFAULT 'AI_GENERATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuilderScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "builderId" TEXT,
    "developerGroup" TEXT,
    "cityId" TEXT NOT NULL,
    "localityId" TEXT NOT NULL,
    "microMarketId" TEXT,
    "status" "ProjectStatus" NOT NULL,
    "category" "PropertyCategory" NOT NULL DEFAULT 'RESIDENTIAL',
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "launchDate" TIMESTAMP(3),
    "promisedPossession" TIMESTAMP(3),
    "actualPossession" TIMESTAMP(3),
    "constructionPercent" INTEGER,
    "reraNumber" TEXT,
    "reraStatus" TEXT,
    "totalUnits" INTEGER,
    "totalTowers" INTEGER,
    "landAreaAcres" DECIMAL(8,2),
    "priceMinPaise" BIGINT,
    "priceMaxPaise" BIGINT,
    "dataSource" "DataSource" NOT NULL DEFAULT 'MANUALLY_VERIFIED',
    "confidence" "Confidence" NOT NULL DEFAULT 'HIGH',
    "sourceRef" TEXT,
    "ingestBatchId" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isTrending" BOOLEAN NOT NULL DEFAULT false,
    "isLuxury" BOOLEAN NOT NULL DEFAULT false,
    "isAffordable" BOOLEAN NOT NULL DEFAULT false,
    "brochureUrl" TEXT,
    "videoUrl" TEXT,
    "tour360Url" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectImage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'hero',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dataSource" "DataSource" NOT NULL DEFAULT 'BUILDER_INFORMATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuration" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "bedrooms" DECIMAL(3,1) NOT NULL,
    "carpetSqft" DECIMAL(9,2),
    "builtUpSqft" DECIMAL(9,2),
    "priceMinPaise" BIGINT,
    "priceMaxPaise" BIGINT,
    "dataSource" "DataSource" NOT NULL DEFAULT 'BUILDER_INFORMATION',
    "confidence" "Confidence" NOT NULL DEFAULT 'MEDIUM',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Amenity" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "category" "AmenityCategory" NOT NULL DEFAULT 'CONVENIENCE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Amenity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAmenity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "amenityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAmenity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "localityId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL DEFAULT 'SALE',
    "registrationDate" TIMESTAMP(3) NOT NULL,
    "valuePaise" BIGINT NOT NULL,
    "carpetSqft" DECIMAL(10,2),
    "pricePerSqftPaise" BIGINT,
    "bedrooms" DECIMAL(3,1),
    "floor" INTEGER,
    "tower" TEXT,
    "unitLabel" TEXT,
    "dataSource" "DataSource" NOT NULL DEFAULT 'MANUALLY_VERIFIED',
    "confidence" "Confidence" NOT NULL DEFAULT 'MEDIUM',
    "sourceRef" TEXT,
    "ingestBatchId" TEXT,
    "sourceNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistoryPoint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "avgPricePerSqftPaise" BIGINT NOT NULL,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "dataSource" "DataSource" NOT NULL DEFAULT 'MANUALLY_VERIFIED',
    "confidence" "Confidence" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistoryPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMetric" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueNumeric" DECIMAL(18,2),
    "valueText" TEXT,
    "unit" TEXT,
    "dataSource" "DataSource" NOT NULL DEFAULT 'AI_GENERATED',
    "confidence" "Confidence" NOT NULL DEFAULT 'MEDIUM',
    "methodologyVersion" TEXT,
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentNote" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dataSource" "DataSource" NOT NULL DEFAULT 'AI_GENERATED',
    "confidence" "Confidence" NOT NULL DEFAULT 'MEDIUM',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfraAsset" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "type" "InfraType" NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'operational',
    "dataSource" "DataSource" NOT NULL DEFAULT 'OFFICIAL_GOVERNMENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfraAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectInfra" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "infraId" TEXT NOT NULL,
    "distanceMeters" INTEGER NOT NULL,
    "walkMinutes" INTEGER,
    "dataSource" "DataSource" NOT NULL DEFAULT 'MANUALLY_VERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectInfra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'EDITOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestBatch" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "recordsWritten" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "IngestBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Country_name_key" ON "Country"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Country_iso2_key" ON "Country"("iso2");

-- CreateIndex
CREATE UNIQUE INDEX "State_countryId_code_key" ON "State"("countryId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "State_countryId_name_key" ON "State"("countryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "City_slug_key" ON "City"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "City_stateId_name_key" ON "City"("stateId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_cityId_slug_key" ON "Zone"("cityId", "slug");

-- CreateIndex
CREATE INDEX "Locality_zoneId_idx" ON "Locality"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "Locality_cityId_slug_key" ON "Locality"("cityId", "slug");

-- CreateIndex
CREATE INDEX "LocalityAlias_alias_idx" ON "LocalityAlias"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "MicroMarket_localityId_slug_key" ON "MicroMarket"("localityId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Builder_slug_key" ON "Builder"("slug");

-- CreateIndex
CREATE INDEX "Builder_name_idx" ON "Builder"("name");

-- CreateIndex
CREATE INDEX "BuilderTimelineEvent_builderId_year_idx" ON "BuilderTimelineEvent"("builderId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "BuilderScoreSnapshot_builderId_asOf_key" ON "BuilderScoreSnapshot"("builderId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Project_reraNumber_key" ON "Project"("reraNumber");

-- CreateIndex
CREATE INDEX "Project_cityId_status_idx" ON "Project"("cityId", "status");

-- CreateIndex
CREATE INDEX "Project_localityId_idx" ON "Project"("localityId");

-- CreateIndex
CREATE INDEX "Project_builderId_idx" ON "Project"("builderId");

-- CreateIndex
CREATE INDEX "Project_isPublished_idx" ON "Project"("isPublished");

-- CreateIndex
CREATE INDEX "Project_isFeatured_idx" ON "Project"("isFeatured");

-- CreateIndex
CREATE INDEX "Project_isArchived_idx" ON "Project"("isArchived");

-- CreateIndex
CREATE INDEX "ProjectImage_projectId_sortOrder_idx" ON "ProjectImage"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "Configuration_projectId_sortOrder_idx" ON "Configuration"("projectId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Amenity_slug_key" ON "Amenity"("slug");

-- CreateIndex
CREATE INDEX "Amenity_category_idx" ON "Amenity"("category");

-- CreateIndex
CREATE INDEX "ProjectAmenity_amenityId_idx" ON "ProjectAmenity"("amenityId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAmenity_projectId_amenityId_key" ON "ProjectAmenity"("projectId", "amenityId");

-- CreateIndex
CREATE INDEX "Transaction_projectId_registrationDate_idx" ON "Transaction"("projectId", "registrationDate");

-- CreateIndex
CREATE INDEX "Transaction_localityId_registrationDate_idx" ON "Transaction"("localityId", "registrationDate");

-- CreateIndex
CREATE INDEX "Transaction_registrationDate_idx" ON "Transaction"("registrationDate");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_dataSource_sourceRef_key" ON "Transaction"("dataSource", "sourceRef");

-- CreateIndex
CREATE INDEX "PriceHistoryPoint_projectId_month_idx" ON "PriceHistoryPoint"("projectId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PriceHistoryPoint_projectId_month_key" ON "PriceHistoryPoint"("projectId", "month");

-- CreateIndex
CREATE INDEX "ProjectMetric_projectId_idx" ON "ProjectMetric"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMetric_projectId_key_key" ON "ProjectMetric"("projectId", "key");

-- CreateIndex
CREATE INDEX "InvestmentNote_projectId_kind_sortOrder_idx" ON "InvestmentNote"("projectId", "kind", "sortOrder");

-- CreateIndex
CREATE INDEX "InfraAsset_cityId_type_idx" ON "InfraAsset"("cityId", "type");

-- CreateIndex
CREATE INDEX "ProjectInfra_projectId_distanceMeters_idx" ON "ProjectInfra"("projectId", "distanceMeters");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInfra_projectId_infraId_key" ON "ProjectInfra"("projectId", "infraId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "IngestBatch_sourceKey_startedAt_idx" ON "IngestBatch"("sourceKey", "startedAt");

-- AddForeignKey
ALTER TABLE "State" ADD CONSTRAINT "State_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Locality" ADD CONSTRAINT "Locality_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Locality" ADD CONSTRAINT "Locality_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalityAlias" ADD CONSTRAINT "LocalityAlias_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroMarket" ADD CONSTRAINT "MicroMarket_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuilderTimelineEvent" ADD CONSTRAINT "BuilderTimelineEvent_builderId_fkey" FOREIGN KEY ("builderId") REFERENCES "Builder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuilderScoreSnapshot" ADD CONSTRAINT "BuilderScoreSnapshot_builderId_fkey" FOREIGN KEY ("builderId") REFERENCES "Builder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_builderId_fkey" FOREIGN KEY ("builderId") REFERENCES "Builder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_microMarketId_fkey" FOREIGN KEY ("microMarketId") REFERENCES "MicroMarket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectImage" ADD CONSTRAINT "ProjectImage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Configuration" ADD CONSTRAINT "Configuration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAmenity" ADD CONSTRAINT "ProjectAmenity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAmenity" ADD CONSTRAINT "ProjectAmenity_amenityId_fkey" FOREIGN KEY ("amenityId") REFERENCES "Amenity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistoryPoint" ADD CONSTRAINT "PriceHistoryPoint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMetric" ADD CONSTRAINT "ProjectMetric_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentNote" ADD CONSTRAINT "InvestmentNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInfra" ADD CONSTRAINT "ProjectInfra_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInfra" ADD CONSTRAINT "ProjectInfra_infraId_fkey" FOREIGN KEY ("infraId") REFERENCES "InfraAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

