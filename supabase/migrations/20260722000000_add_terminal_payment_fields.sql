-- Add Terminal Tap to Pay fields to payment_requests table
-- Migration: 20260722000000_add_terminal_payment_fields.sql
-- Purpose: Support Stripe Terminal card_present payments

ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS payment_method_type TEXT DEFAULT 'card' CHECK (payment_method_type IN ('card', 'card_present')),
ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS payment_intent_client_secret TEXT;

-- Index for job-based payments
CREATE INDEX IF NOT EXISTS idx_payment_requests_job_id ON payment_requests(job_id);

-- Comment for documentation
COMMENT ON COLUMN payment_requests.payment_method_type IS 'Payment method type: card for online Checkout, card_present for Terminal Tap to Pay';
COMMENT ON COLUMN payment_requests.job_id IS 'Optional job reference for job-based payments';
COMMENT ON COLUMN payment_requests.payment_intent_client_secret IS 'Client secret for Terminal PaymentIntent (not stored for Checkout Sessions)';
