-- Add final_recovery_outcome to ai_call_records for customer impact monitoring
-- Migration: 20260717000000_add_final_recovery_outcome.sql
-- Purpose: Track the final customer-facing recovery outcome of AI-intended calls

-- Add final_recovery_outcome column to ai_call_records
-- This field tracks the ultimate customer-facing result after all fallbacks
-- Monotonic: can only move from null/less recovered to more recovered states
ALTER TABLE ai_call_records
ADD COLUMN IF NOT EXISTS final_recovery_outcome TEXT CHECK (final_recovery_outcome IN (
    'ai_success',           -- AI successfully handled the call (completed)
    'voicemail_success',    -- Voicemail fallback succeeded (voicemail recorded)
    'sms_success',          -- SMS fallback succeeded (SMS sent)
    'unrecovered'           -- No recovery - no voicemail, no SMS
));

-- Add index for querying by recovery outcome
CREATE INDEX IF NOT EXISTS idx_ai_call_records_final_recovery_outcome 
ON ai_call_records(final_recovery_outcome);

-- Add comment for documentation
COMMENT ON COLUMN ai_call_records.final_recovery_outcome IS 'Final customer-facing recovery outcome after all fallbacks: ai_success, voicemail_success, sms_success, unrecovered. Monotonic - only moves toward recovery.';
