-- Add fields to support number recycling during account deletion
-- These fields track when a number was detached from a business and why

ALTER TABLE twilio_numbers 
ADD COLUMN IF NOT EXISTS detached_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS detached_reason TEXT;

-- Add comment to explain the new fields
COMMENT ON COLUMN twilio_numbers.detached_at IS 'Timestamp when number was detached from a business (for recycling)';
COMMENT ON COLUMN twilio_numbers.detached_reason IS 'Reason for detachment (e.g., account_deletion, manual_release)';
