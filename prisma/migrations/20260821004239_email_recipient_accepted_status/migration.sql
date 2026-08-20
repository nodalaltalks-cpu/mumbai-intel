-- AlterEnum
-- EmailRecipientStatus.SENT is renamed to ACCEPTED for clarity: it has only ever
-- meant "Resend's API accepted the send", never true delivery confirmation.
-- Existing SENT rows are remapped to ACCEPTED (not dropped) since the value now
-- means exactly what those rows already represented.
BEGIN;
CREATE TYPE "EmailRecipientStatus_new" AS ENUM ('PENDING', 'ACCEPTED', 'FAILED');
ALTER TABLE "public"."EmailCampaignRecipient" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "EmailCampaignRecipient" ALTER COLUMN "status" TYPE "EmailRecipientStatus_new" USING (
  CASE status::text WHEN 'SENT' THEN 'ACCEPTED' ELSE status::text END::"EmailRecipientStatus_new"
);
ALTER TYPE "EmailRecipientStatus" RENAME TO "EmailRecipientStatus_old";
ALTER TYPE "EmailRecipientStatus_new" RENAME TO "EmailRecipientStatus";
DROP TYPE "public"."EmailRecipientStatus_old";
ALTER TABLE "EmailCampaignRecipient" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "EmailCampaignRecipient" ADD COLUMN     "providerMessageId" TEXT;
