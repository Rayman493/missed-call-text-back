-- Add default_communication_source field to businesses table
-- Migration: 20260729000000_add_default_communication_source.sql
-- Purpose: Store user's preferred communication method (ReplyFlow or business phone)

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS default_communication_source TEXT DEFAULT 'replyflow' CHECK (default_communication_source IN ('replyflow', 'business'));

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_businesses_default_communication_source ON businesses(default_communication_source);

-- Add comment for documentation
COMMENT ON COLUMN businesses.default_communication_source IS 'Default communication method for customer interactions: replyflow (send through ReplyFlow) or business (use user\'s business phone)';
