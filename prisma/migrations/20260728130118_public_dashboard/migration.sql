-- CreateTable
CREATE TABLE "Wishlist" (
    "id" TEXT NOT NULL,
    "publicUserId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wishlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecentView" (
    "id" TEXT NOT NULL,
    "publicUserId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecentView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL,
    "publicUserId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "filtersJson" JSONB NOT NULL,
    "notifyOnMatch" BOOLEAN NOT NULL DEFAULT false,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchHistory" (
    "id" TEXT NOT NULL,
    "publicUserId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "searchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "id" TEXT NOT NULL,
    "publicUserId" TEXT NOT NULL,
    "preferredBudgetMinRupees" INTEGER,
    "preferredBudgetMaxRupees" INTEGER,
    "preferredLocalityIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredCategory" "PropertyCategory",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreferences" (
    "id" TEXT NOT NULL,
    "publicUserId" TEXT NOT NULL,
    "savedSearchAlerts" BOOLEAN NOT NULL DEFAULT true,
    "weeklyDigest" BOOLEAN NOT NULL DEFAULT true,
    "productUpdates" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Wishlist_publicUserId_idx" ON "Wishlist"("publicUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_publicUserId_entityType_entityId_key" ON "Wishlist"("publicUserId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "RecentView_publicUserId_viewedAt_idx" ON "RecentView"("publicUserId", "viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecentView_publicUserId_entityType_entityId_key" ON "RecentView"("publicUserId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "SavedSearch_publicUserId_idx" ON "SavedSearch"("publicUserId");

-- CreateIndex
CREATE INDEX "SearchHistory_publicUserId_searchedAt_idx" ON "SearchHistory"("publicUserId", "searchedAt");

-- CreateIndex
CREATE INDEX "SearchHistory_query_idx" ON "SearchHistory"("query");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_publicUserId_key" ON "UserPreferences"("publicUserId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreferences_publicUserId_key" ON "NotificationPreferences"("publicUserId");

-- AddForeignKey
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_publicUserId_fkey" FOREIGN KEY ("publicUserId") REFERENCES "PublicUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecentView" ADD CONSTRAINT "RecentView_publicUserId_fkey" FOREIGN KEY ("publicUserId") REFERENCES "PublicUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_publicUserId_fkey" FOREIGN KEY ("publicUserId") REFERENCES "PublicUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchHistory" ADD CONSTRAINT "SearchHistory_publicUserId_fkey" FOREIGN KEY ("publicUserId") REFERENCES "PublicUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_publicUserId_fkey" FOREIGN KEY ("publicUserId") REFERENCES "PublicUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreferences" ADD CONSTRAINT "NotificationPreferences_publicUserId_fkey" FOREIGN KEY ("publicUserId") REFERENCES "PublicUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

