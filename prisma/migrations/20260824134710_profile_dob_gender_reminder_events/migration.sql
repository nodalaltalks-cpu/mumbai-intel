-- Personal Details additions (Date of Birth, Gender) -- private, optional, never exposed publicly
ALTER TABLE "PublicUser" ADD COLUMN "dateOfBirth" DATE;
ALTER TABLE "PublicUser" ADD COLUMN "gender" TEXT;

-- Guided-completion abandonment + admin reminder funnel
ALTER TYPE "ResearchEventType" ADD VALUE 'PROFILE_COMPLETION_ABANDONED';
ALTER TYPE "ResearchEventType" ADD VALUE 'ADMIN_PROFILE_REMINDER_SENT';
ALTER TYPE "ResearchEventType" ADD VALUE 'PROFILE_COMPLETION_AFTER_REMINDER';

-- Distinguishes a single personalized profile-completion nudge from a bulk NotificationCampaign send
ALTER TYPE "NotificationType" ADD VALUE 'PROFILE_COMPLETION_REMINDER';
