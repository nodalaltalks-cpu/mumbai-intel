-- Phase 68: adds an OPTIONAL, minimal developer spokesperson credit line to
-- Builder -- reused across every project by that developer, same as the
-- existing Builder.websiteUrl. Deliberately name + designation only; no
-- phone/email/personal contact fields, no consultation/contact workflow.
-- AlterTable
ALTER TABLE "Builder" ADD COLUMN "spokespersonName" TEXT,
ADD COLUMN "spokespersonDesignation" TEXT;
