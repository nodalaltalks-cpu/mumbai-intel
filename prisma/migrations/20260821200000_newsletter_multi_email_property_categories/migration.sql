-- NewsletterSubscriber: allow one account to hold multiple subscriptions
-- (one per distinct email address). Email stays the sole uniqueness
-- boundary; publicUserId becomes a plain, non-unique foreign key.
DROP INDEX "NewsletterSubscriber_publicUserId_key";
CREATE INDEX "NewsletterSubscriber_publicUserId_idx" ON "NewsletterSubscriber"("publicUserId");

-- UserPreferences: preferredCategory (single enum) -> preferredCategories
-- (text array), matching the multi-select pattern already used by
-- preferredConfigurations/preferredReadiness/purposes. Existing single
-- values are preserved into the new array column before the old column is
-- dropped -- no data is discarded.
ALTER TABLE "UserPreferences" ADD COLUMN "preferredCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "UserPreferences" SET "preferredCategories" = ARRAY["preferredCategory"::TEXT] WHERE "preferredCategory" IS NOT NULL;
ALTER TABLE "UserPreferences" DROP COLUMN "preferredCategory";
