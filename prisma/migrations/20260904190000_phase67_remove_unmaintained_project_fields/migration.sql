-- Phase 67: removes 4 Project fields the founder decided not to maintain.
-- Pre-migration data audit (2026-09-04, real Neon data, 2 total Project rows):
--   latitude:   0 non-null rows
--   longitude:  0 non-null rows
--   priceMaxPaise: 1 non-null row (a single-listing-price artifact, not a
--     real project-wide ceiling -- see lib/enrichment/classifyEnrichment.ts's
--     former SINGLE_LISTING_PRICE handling, removed alongside this column)
--   reraStatus: 2 non-null rows (both "Registered", never a second source of
--     truth beyond reraNumber, which is untouched)
-- Confirmed via full-repo search: no remaining application code references
-- Project.latitude/longitude/priceMaxPaise/reraStatus (InfraAsset.latitude/
-- longitude, Locality.centroidLat/centroidLng, and Configuration.priceMinPaise/
-- priceMaxPaise are separate, unrelated columns on other models -- untouched).
-- AlterTable
ALTER TABLE "Project" DROP COLUMN "latitude",
DROP COLUMN "longitude",
DROP COLUMN "priceMaxPaise",
DROP COLUMN "reraStatus";
