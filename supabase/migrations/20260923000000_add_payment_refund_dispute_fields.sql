-- Add Stripe-managed refund and dispute reconciliation fields to payment_requests
-- Migration: 20260923000000_add_payment_refund_dispute_fields.sql
-- Purpose: Record Stripe-initiated refunds and disputes without changing the
--          existing status CHECK constraint or payment workflow.
--
-- Design notes:
-- - `status` remains the payment lifecycle value ('paid' stays 'paid' after a
--   refund — the payment did succeed). Refund/dispute state is independent.
-- - refunded_amount_cents is authoritative from Stripe (charge.amount_refunded),
--   never client-supplied, in integer minor currency units.
-- - dispute fields mirror Stripe dispute state; 'won' does not imply funds
--   were reinstated — it only reflects the dispute outcome Stripe reported.

ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS refunded_amount_cents INTEGER NOT NULL DEFAULT 0
    CHECK (refunded_amount_cents >= 0),
  ADD COLUMN IF NOT EXISTS refund_status TEXT
    CHECK (refund_status IN ('pending', 'partially_refunded', 'refunded', 'failed')),
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_id TEXT,
  ADD COLUMN IF NOT EXISTS dispute_status TEXT
    CHECK (dispute_status IN ('open', 'won', 'lost')),
  ADD COLUMN IF NOT EXISTS dispute_reason TEXT,
  ADD COLUMN IF NOT EXISTS dispute_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_payment_requests_refund_status
  ON payment_requests(refund_status) WHERE refund_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_requests_dispute_status
  ON payment_requests(dispute_status) WHERE dispute_status IS NOT NULL;

COMMENT ON COLUMN payment_requests.refunded_amount_cents IS 'Authoritative total refunded (Stripe charge.amount_refunded), integer minor units';
COMMENT ON COLUMN payment_requests.refund_status IS 'Stripe refund reconciliation state: pending | partially_refunded | refunded | failed';
COMMENT ON COLUMN payment_requests.dispute_status IS 'Stripe dispute outcome: open | won | lost';
