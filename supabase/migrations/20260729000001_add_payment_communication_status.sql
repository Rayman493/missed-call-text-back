-- Add communication_status field to payment_requests table
-- Migration: 20260729000001_add_payment_communication_status.sql
-- Purpose: Track communication status for payment requests (separate from payment status)
-- This enables Desktop → Mobile Business Phone handoff workflow

ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS communication_status TEXT DEFAULT NULL CHECK (communication_status IN ('ready_to_send', 'sent_manually', NULL));

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_payment_requests_communication_status ON payment_requests(communication_status);

-- Add comment for documentation
COMMENT ON COLUMN payment_requests.communication_status IS 'Communication status for payment requests (separate from payment status). Used for Desktop → Mobile Business Phone handoff workflow. Values: ready_to_send, sent_manually, NULL. NULL indicates ReplyFlow communication (standard behavior).';
