-- Add trial_started_at column to businesses table
-- This column tracks when a trial started for 30-day trial cooldown logic
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;

-- Add comment to explain the purpose
COMMENT ON COLUMN businesses.trial_started_at IS 'Timestamp when the trial started, used for 30-day trial cooldown logic';
