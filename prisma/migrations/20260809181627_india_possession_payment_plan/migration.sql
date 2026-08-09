-- CreateEnum
CREATE TYPE "PaymentPlanType" AS ENUM ('CONSTRUCTION_LINKED', 'BUILDER_SUBVENTION', 'BANK_SUBVENTION', 'DOWN_PAYMENT', 'FLEXI_PAYMENT', 'NO_PAYMENT_PLAN');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "paymentPlanDescription" TEXT,
ADD COLUMN     "paymentPlanType" "PaymentPlanType",
ADD COLUMN     "possessionMonth" INTEGER,
ADD COLUMN     "possessionYear" INTEGER;

