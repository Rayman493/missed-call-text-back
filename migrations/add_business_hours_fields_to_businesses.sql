-- Add business hours fields to businesses table
-- CRITICAL: These fields are required for timezone-aware business hours enforcement
-- Migration: add_business_hours_fields_to_businesses.sql

-- Add business hours enabled toggle
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS business_hours_enabled boolean DEFAULT false;

-- Add business hours start time (HH:MM format)
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS business_hours_start text;

-- Add business hours end time (HH:MM format)
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS business_hours_end text;

-- Add business hours timezone (IANA timezone identifier)
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS business_hours_timezone text DEFAULT 'America/New_York';

-- Add after-hours message
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS after_hours_message text;

-- Add automation_settings JSONB column for follow-ups and smart filtering
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS automation_settings jsonb DEFAULT '{"spamRepeatFilteringEnabled": false, "ignoreRepeatCalls": false, "repeatCallWindowMinutes": 30, "ignoreBlockedPrivateNumbers": false, "ignoreSuspectedSpamCallers": false, "blockedNumbers": []}'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN businesses.business_hours_enabled IS 'Toggle to enable/disable business hours enforcement for auto-replies';
COMMENT ON COLUMN businesses.business_hours_start IS 'Business hours start time in HH:MM format (e.g., "09:00")';
COMMENT ON COLUMN businesses.business_hours_end IS 'Business hours end time in HH:MM format (e.g., "18:00")';
COMMENT ON COLUMN businesses.business_hours_timezone IS 'IANA timezone identifier for business hours (e.g., "America/New_York")';
COMMENT ON COLUMN businesses.after_hours_message IS 'Message to send when missed calls occur outside business hours';
COMMENT ON COLUMN businesses.automation_settings IS 'JSONB settings for automation features (follow-ups, smart filtering, etc.)';

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_businesses_business_hours_enabled ON businesses(business_hours_enabled);
