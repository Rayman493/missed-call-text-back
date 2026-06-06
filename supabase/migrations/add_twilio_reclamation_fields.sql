-- Add Twilio number reclamation fields for 30-day grace period
-- This allows safe reclamation of Twilio numbers from inactive accounts

-- Add reclamation fields to businesses table
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS twilio_release_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS twilio_released_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS twilio_release_status text NULL,
ADD COLUMN IF NOT EXISTS twilio_release_reason text NULL,
ADD COLUMN IF NOT EXISTS twilio_release_grace_days integer DEFAULT 30;

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_businesses_twilio_release_at ON businesses(twilio_release_at);
CREATE INDEX IF NOT EXISTS idx_businesses_twilio_release_status ON businesses(twilio_release_status);

-- Add check constraint for release_status
ALTER TABLE businesses 
ADD CONSTRAINT twilio_release_status_check 
CHECK (twilio_release_status IN ('scheduled', 'retained', 'released', 'reactivated', NULL));

-- Add comments for documentation
COMMENT ON COLUMN businesses.twilio_release_at IS 'Timestamp when Twilio number is scheduled for release (set when access is lost)';
COMMENT ON COLUMN businesses.twilio_released_at IS 'Timestamp when Twilio number was actually released';
COMMENT ON COLUMN businesses.twilio_release_status IS 'Status of Twilio number release: scheduled, retained, released, reactivated';
COMMENT ON COLUMN businesses.twilio_release_reason IS 'Reason for release: access_expired, subscription_canceled, manual_access_revoked, reactivated_during_grace_period, churn_grace_period_expired, admin_manual_release';
COMMENT ON COLUMN businesses.twilio_release_grace_days IS 'Number of days to retain Twilio number after access is lost (default: 30)';

-- Verification query
SELECT column_name, 
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'businesses' AND column_name = column_name) as exists
FROM (VALUES 
  ('twilio_release_at'),
  ('twilio_released_at'),
  ('twilio_release_status'),
  ('twilio_release_reason'),
  ('twilio_release_grace_days')
) AS t(column_name);
