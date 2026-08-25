-- Profile navigation/guided-completion analytics (auto-scroll, section clicks, resumed sessions)
ALTER TYPE "ResearchEventType" ADD VALUE 'PROFILE_CTA_CLICKED';
ALTER TYPE "ResearchEventType" ADD VALUE 'PROFILE_SECTION_CLICKED';
ALTER TYPE "ResearchEventType" ADD VALUE 'PROFILE_COMPLETION_RESUMED';
