-- Add stripe_terminal_location_id to businesses table
-- Migration: 20260722000001_add_terminal_location_to_businesses.sql
-- Purpose: Store Stripe Terminal Location ID for Tap to Pay

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS stripe_terminal_location_id TEXT;

-- Index for Terminal Location lookups
CREATE INDEX IF NOT EXISTS idx_businesses_stripe_terminal_location_id ON businesses(stripe_terminal_location_id);

-- Comment for documentation
COMMENT ON COLUMN businesses.stripe_terminal_location_id IS 'Stripe Terminal Location ID for Tap to Pay payments';
