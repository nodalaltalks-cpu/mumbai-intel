-- Cookie consent decision events (recorded via the existing ResearchEvent pipeline)
ALTER TYPE "ResearchEventType" ADD VALUE 'COOKIE_CONSENT_GRANTED';
ALTER TYPE "ResearchEventType" ADD VALUE 'COOKIE_CONSENT_DECLINED';

-- Supports the admin Visitors page (anonymous/returning/anon-to-registered aggregates)
CREATE INDEX "ResearchEvent_sessionId_createdAt_idx" ON "ResearchEvent"("sessionId", "createdAt");
