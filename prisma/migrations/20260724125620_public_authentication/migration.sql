-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('CREDENTIALS', 'GOOGLE');

-- CreateTable
CREATE TABLE "PublicUser" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT,
    "provider" "AuthProvider" NOT NULL DEFAULT 'CREDENTIALS',
    "googleId" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicPasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicPasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicUser_email_key" ON "PublicUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PublicUser_phone_key" ON "PublicUser"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "PublicUser_googleId_key" ON "PublicUser"("googleId");

-- CreateIndex
CREATE INDEX "PublicUser_provider_idx" ON "PublicUser"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "PublicPasswordResetToken_tokenHash_key" ON "PublicPasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PublicPasswordResetToken_userId_idx" ON "PublicPasswordResetToken"("userId");

-- AddForeignKey
ALTER TABLE "PublicPasswordResetToken" ADD CONSTRAINT "PublicPasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PublicUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
