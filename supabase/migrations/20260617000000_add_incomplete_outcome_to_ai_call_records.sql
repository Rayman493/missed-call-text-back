-- Add 'incomplete' to ai_call_records outcome check constraint
-- Migration: 20260617000000_add_incomplete_outcome_to_ai_call_records.sql
-- Purpose: Allow 'incomplete' as a valid outcome for partial AI intake finalization

-- Drop the existing check constraint
ALTER TABLE ai_call_records DROP CONSTRAINT IF EXISTS ai_call_records_outcome_check;

-- Recreate the check constraint with 'incomplete' included
ALTER TABLE ai_call_records 
ADD CONSTRAINT ai_call_records_outcome_check 
CHECK (outcome IN (
    'completed',
    'caller_hung_up',
    'ai_failed',
    'voicemail_fallback',
    'incomplete'
));

-- Update the comment to reflect the new outcome
COMMENT ON COLUMN ai_call_records.outcome IS 'Call outcome: completed, caller_hung_up, ai_failed, voicemail_fallback, incomplete';
