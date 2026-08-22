-- Create dedicated AI summary SMS claims table
-- Migration: 20260904000001_create_ai_summary_sms_claims.sql
-- Purpose: Separate table for AI summary SMS send ownership/idempotency
-- This prevents ghost "Pending" messages in Customer Conversation UI

-- Create ai_summary_sms_claims table
CREATE TABLE IF NOT EXISTS ai_summary_sms_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  call_sid TEXT NOT NULL,
  claim_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'sent', 'failed_ambiguous', 'failed_definitive')),
  lead_id UUID,
  conversation_id UUID,
  twilio_message_sid TEXT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: exactly one claim per business + call (atomic claim enforcement)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_summary_claims_business_call
ON ai_summary_sms_claims (business_id, call_sid);

-- Index for stale claim recovery (status + claimed_at pattern)
CREATE INDEX IF NOT EXISTS idx_ai_summary_claims_status_claimed_at
ON ai_summary_sms_claims (status, claimed_at)
WHERE status = 'claimed';

-- Enable RLS (no client policies - service role bypasses RLS)
ALTER TABLE ai_summary_sms_claims ENABLE ROW LEVEL SECURITY;

-- No policies created:
-- - anon/authenticated clients cannot access (RLS denies by default with no policies)
-- - service_role bypasses RLS entirely (used by supabaseAdmin)
-- This table is internal server-only infrastructure

-- Add comments for documentation
COMMENT ON TABLE ai_summary_sms_claims IS 'Durable ownership claims for AI summary SMS events. Prevents duplicate sends without creating ghost messages in Customer Conversation UI. RLS enabled with no policies - service-role only via RLS bypass.';
COMMENT ON COLUMN ai_summary_sms_claims.business_id IS 'Business (tenant) owning the claim';
COMMENT ON COLUMN ai_summary_sms_claims.call_sid IS 'Twilio call SID - unique identifier for the call event';
COMMENT ON COLUMN ai_summary_sms_claims.claim_token IS 'Ownership token for compare-and-set stale reclaim';
COMMENT ON COLUMN ai_summary_sms_claims.status IS 'Claim state: claimed (active), sent (success), failed_ambiguous (preserve block), failed_definitive (may retry)';
COMMENT ON COLUMN ai_summary_sms_claims.claimed_at IS 'Timestamp when claim was created or last reclaimed';
COMMENT ON COLUMN ai_summary_sms_claims.twilio_message_sid IS 'Twilio message SID after successful send';
COMMENT ON INDEX idx_ai_summary_claims_business_call IS 'Enforces exactly one claim per business + call (atomic claim)';
COMMENT ON INDEX idx_ai_summary_claims_status_claimed_at IS 'Enables efficient stale claim recovery for claimed status';