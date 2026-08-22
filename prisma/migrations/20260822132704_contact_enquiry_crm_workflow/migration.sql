-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContactEnquiryStatus" ADD VALUE 'WAITING_FOR_USER';
ALTER TYPE "ContactEnquiryStatus" ADD VALUE 'CLOSED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CONTACT_ENQUIRY_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'CONTACT_ENQUIRY_IN_PROGRESS';
ALTER TYPE "NotificationType" ADD VALUE 'CONTACT_ENQUIRY_WAITING_FOR_USER';
ALTER TYPE "NotificationType" ADD VALUE 'CONTACT_ENQUIRY_RESPONSE';
ALTER TYPE "NotificationType" ADD VALUE 'CONTACT_ENQUIRY_RESOLVED';
ALTER TYPE "NotificationType" ADD VALUE 'CONTACT_ENQUIRY_CLOSED';
ALTER TYPE "NotificationType" ADD VALUE 'CONTACT_ENQUIRY_REOPENED';
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_NEW_ENQUIRY';
