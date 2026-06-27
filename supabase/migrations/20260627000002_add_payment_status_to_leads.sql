-- Add payment status fields to leads table
-- Migration: 20260627000002_add_payment_status_to_leads.sql
-- Purpose: Track payment status for leads

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'none' CHECK (payment_status IN ('none', 'pending', 'paid', 'failed', 'cancelled')),
ADD COLUMN IF NOT EXISTS last_payment_request_id uuid REFERENCES payment_requests(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS last_payment_amount_cents INTEGER,
ADD COLUMN IF NOT EXISTS last_payment_requested_at timestamptz,
ADD COLUMN IF NOT EXISTS last_payment_paid_at timestamptz;

-- Index for payment status filtering
CREATE INDEX IF NOT EXISTS idx_leads_payment_status ON leads(payment_status);

-- Comment for documentation
COMMENT ON COLUMN leads.payment_status IS 'Overall payment status for the lead';
COMMENT ON COLUMN leads.last_payment_request_id IS 'Reference to the most recent payment request';
COMMENT ON COLUMN leads.last_payment_amount_cents IS 'Amount of the most recent payment request';
COMMENT ON COLUMN leads.last_payment_requested_at IS 'When the most recent payment was requested';
COMMENT ON COLUMN leads.last_payment_paid_at IS 'When the most recent payment was completed';
