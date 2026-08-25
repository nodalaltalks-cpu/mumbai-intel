-- DropIndex
DROP INDEX "PublicUser_phone_key";

-- AlterTable
ALTER TABLE "PublicUser" ADD COLUMN     "phoneCountryCode" TEXT NOT NULL DEFAULT '+91';

-- CreateIndex
CREATE UNIQUE INDEX "PublicUser_phoneCountryCode_phone_key" ON "PublicUser"("phoneCountryCode", "phone");
