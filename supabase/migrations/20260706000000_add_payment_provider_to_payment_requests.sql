-- Add payment_provider column to payment_requests table
-- Migration: 20260706000000_add_payment_provider_to_payment_requests.sql
-- Purpose: Support multiple payment providers (Stripe, Venmo, PayPal)

ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS payment_provider TEXT CHECK (payment_provider IN ('stripe', 'venmo', 'paypal'));

-- Add index for payment provider filtering
CREATE INDEX IF NOT EXISTS idx_payment_requests_payment_provider ON payment_requests(payment_provider);

-- Add comment to document the new field
COMMENT ON COLUMN payment_requests.payment_provider IS 'Payment provider used for this request: stripe, venmo, or paypal';
