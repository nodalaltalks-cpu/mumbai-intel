-- AlterTable: convert Amenity.category from the AmenityCategory enum to plain text,
-- preserving every existing row's value (hand-written instead of Prisma's default
-- DROP COLUMN + ADD COLUMN, which would have reset every row back to the column default).
ALTER TABLE "Amenity" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "Amenity" ALTER COLUMN "category" TYPE TEXT USING "category"::TEXT;
ALTER TABLE "Amenity" ALTER COLUMN "category" SET DEFAULT 'CONVENIENCE';

-- DropEnum
DROP TYPE "AmenityCategory";

-- Amenity_category_idx already exists (from the baseline migration) and survives the
-- ALTER COLUMN TYPE above unchanged -- no need to recreate it.
