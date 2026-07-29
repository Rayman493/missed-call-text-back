-- Refactor from global communication preference to mobile-only
-- Migration: 20260729000002_refactor_to_mobile_communication_preference.sql
-- Purpose: Replace global communication preference with mobile-only preference

-- Remove global default_communication_source field (if it exists)
ALTER TABLE businesses DROP COLUMN IF EXISTS default_communication_source;

-- Add mobile-only communication preference field
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS default_mobile_communication_source TEXT DEFAULT 'replyflow' CHECK (default_mobile_communication_source IN ('replyflow', 'business'));

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_businesses_default_mobile_communication_source ON businesses(default_mobile_communication_source);

-- Add comment for documentation
COMMENT ON COLUMN businesses.default_mobile_communication_source IS 'Mobile-only communication preference. Only affects iOS app, Android app, and mobile browser. Desktop always uses ReplyFlow communication. Values: replyflow (default, recommended), business (use native calling/messaging apps).';
