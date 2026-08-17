-- Supports the founder dashboard's DAU/WAU/MAU + 14-day active-users trend
-- (getUserGrowthStats in lib/admin-queries.ts): those queries filter
-- ResearchEvent by a createdAt range and group by publicUserId. Purely
-- additive -- no data change, no existing query behavior changes.
CREATE INDEX "ResearchEvent_createdAt_publicUserId_idx" ON "ResearchEvent"("createdAt", "publicUserId");
