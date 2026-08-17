-- Extends ResearchEventType so Transactions/Market Data/Insights/Reports get the same
-- first-party view-tracking Project/Builder/Locality already had. Postgres adds enum
-- values instantly (no table rewrite); each must be its own statement.
ALTER TYPE "ResearchEventType" ADD VALUE 'TRANSACTION_VIEWED';
ALTER TYPE "ResearchEventType" ADD VALUE 'MARKET_DATA_VIEWED';
ALTER TYPE "ResearchEventType" ADD VALUE 'INSIGHTS_VIEWED';
ALTER TYPE "ResearchEventType" ADD VALUE 'REPORT_VIEWED';
