-- Add cancel_at column to track when subscription is scheduled to end
-- This is set when cancel_at_period_end is true

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS cancel_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN businesses.cancel_at IS 'Timestamp when the subscription is scheduled to end (when cancel_at_period_end is true)';
