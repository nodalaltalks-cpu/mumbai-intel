-- AlterTable
ALTER TABLE "PublicUser" ADD COLUMN     "city" TEXT,
ADD COLUMN     "currentLocality" TEXT;

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "localityFreeText" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "preferredConfigurations" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "preferredReadiness" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "purposes" TEXT[] DEFAULT ARRAY[]::TEXT[];
