-- AlterEnum
ALTER TYPE "ResearchEventType" ADD VALUE 'PROFILE_COMPLETED';
ALTER TYPE "ResearchEventType" ADD VALUE 'PROFILE_PROMPT_SHOWN';
ALTER TYPE "ResearchEventType" ADD VALUE 'PROFILE_PROMPT_CLICKED';
ALTER TYPE "ResearchEventType" ADD VALUE 'PROFILE_PROMPT_DISMISSED';

-- AlterTable
ALTER TABLE "PublicUser" ADD COLUMN     "dismissedPrompts" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "PublicEmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicEmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicEmailVerificationToken_tokenHash_key" ON "PublicEmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PublicEmailVerificationToken_userId_idx" ON "PublicEmailVerificationToken"("userId");

-- AddForeignKey
ALTER TABLE "PublicEmailVerificationToken" ADD CONSTRAINT "PublicEmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PublicUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
