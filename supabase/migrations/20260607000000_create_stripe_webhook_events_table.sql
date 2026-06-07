-- Create stripe_webhook_events table for persistent webhook idempotency
-- This prevents duplicate webhook processing across server restarts and multiple instances

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'processed',
  error_message TEXT,
  business_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Add index for faster lookups by event_id
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_id ON stripe_webhook_events(event_id);

-- Add index for cleanup of old events (by processed_at)
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at ON stripe_webhook_events(processed_at);

-- Add comment
COMMENT ON TABLE stripe_webhook_events IS 'Tracks processed Stripe webhook events for idempotency across server instances and deployments';
