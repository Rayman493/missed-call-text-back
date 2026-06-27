-- Add Stripe Connect fields to businesses table
-- Migration: 20260627000001_add_stripe_connect_to_businesses.sql
-- Purpose: Store Stripe Connect account information for businesses

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS stripe_connect_status TEXT CHECK (stripe_connect_status IN ('not_connected', 'pending', 'connected', 'restricted')),
ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN DEFAULT false;

-- Index for Stripe Connect account lookups
CREATE INDEX IF NOT EXISTS idx_businesses_stripe_connect_account_id ON businesses(stripe_connect_account_id);

-- Comment for documentation
COMMENT ON COLUMN businesses.stripe_connect_account_id IS 'Stripe Connect account ID for the business';
COMMENT ON COLUMN businesses.stripe_connect_status IS 'Status of Stripe Connect onboarding';
COMMENT ON COLUMN businesses.stripe_charges_enabled IS 'Whether the Stripe account can accept charges';
COMMENT ON COLUMN businesses.stripe_payouts_enabled IS 'Whether the Stripe account can receive payouts';
COMMENT ON COLUMN businesses.stripe_details_submitted IS 'Whether required Stripe details have been submitted';
