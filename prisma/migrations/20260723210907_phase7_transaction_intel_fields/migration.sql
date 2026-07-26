-- CreateEnum
CREATE TYPE "BuyerType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "builtUpSqft" DECIMAL(10,2),
ADD COLUMN     "buyerType" "BuyerType";
