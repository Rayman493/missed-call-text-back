-- Ensure default_mobile_communication_source column exists in production
-- Migration: 20260730000000_ensure_default_mobile_communication_source_column.sql
-- Purpose: Add the column if it doesn't exist (for production databases where the previous migration wasn't applied)

-- Add the column if it doesn't exist
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS default_mobile_communication_source TEXT DEFAULT 'replyflow' CHECK (default_mobile_communication_source IN ('replyflow', 'business'));

-- Add index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_businesses_default_mobile_communication_source ON businesses(default_mobile_communication_source);

-- Add comment if it doesn't exist
COMMENT ON COLUMN businesses.default_mobile_communication_source IS 'Mobile-only communication preference. Only affects iOS app, Android app, and mobile browser. Desktop always uses ReplyFlow communication. Values: replyflow (default, recommended), business (use native calling/messaging apps).';
