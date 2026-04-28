-- Add messaging_status, onboarding_status, and trial_ends_at columns to businesses table
-- Migration: add_messaging_status_and_trial_fields.sql

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS messaging_status text default 'not_assigned';

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS onboarding_status text default 'started';

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- Comments for documentation
COMMENT ON COLUMN businesses.messaging_status IS 'Messaging status: not_assigned, pending_verification, active, failed';
COMMENT ON COLUMN businesses.onboarding_status IS 'Onboarding status: started, completed';
COMMENT ON COLUMN businesses.trial_ends_at IS 'Trial expiration timestamp for free trials';
