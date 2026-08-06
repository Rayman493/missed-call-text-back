-- Add lease-based claim fields to stripe_webhook_events table
-- This enables stale processing recovery and failed event reclamation

BEGIN;

-- Add processing_started_at for lease tracking
ALTER TABLE stripe_webhook_events
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP WITH TIME ZONE;

-- Add attempt_count for tracking retry attempts
ALTER TABLE stripe_webhook_events
ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0;

-- Add index for cleanup of stale processing claims
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processing_started_at 
ON stripe_webhook_events(processing_started_at) 
WHERE status = 'processing';

-- Add comment for documentation
COMMENT ON COLUMN stripe_webhook_events.processing_started_at IS 'Timestamp when event was claimed for processing. Used for lease-based stale claim recovery.';
COMMENT ON COLUMN stripe_webhook_events.attempt_count IS 'Number of processing attempts. Incremented on each retry.';

COMMIT;
