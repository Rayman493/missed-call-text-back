-- Add default_sending_source column to businesses table
-- Migration: 20260730000001_add_default_sending_source.sql
-- Purpose: Add a business-level default sending source for outbound SMS actions
-- Values: 'replyflow' (default, automatic sending), 'business' (opens messaging app for manual send)

-- Add the column with default value
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS default_sending_source TEXT DEFAULT 'replyflow' CHECK (default_sending_source IN ('replyflow', 'business'));

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_businesses_default_sending_source ON businesses(default_sending_source);

-- Add comment explaining the field
COMMENT ON COLUMN businesses.default_sending_source IS 'Default sending source for outbound SMS actions. replyflow: automatic sending via ReplyFlow/Twilio, business: opens device messaging app for manual review and send. This is a business-level setting that affects the default behavior of all outbound SMS actions (Send, Payment Request, Appointment messages, etc.). Users can override this per-action.';

-- Migrate any existing default_mobile_communication_source values to default_sending_source
-- This ensures backward compatibility with the old column
UPDATE businesses
SET default_sending_source = COALESCE(default_mobile_communication_source, 'replyflow')
WHERE default_sending_source IS NULL OR default_sending_source = 'replyflow';
