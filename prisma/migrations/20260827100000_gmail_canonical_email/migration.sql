-- AlterTable
ALTER TABLE "PublicUser" ADD COLUMN     "canonicalEmail" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PublicUser_canonicalEmail_key" ON "PublicUser"("canonicalEmail");
