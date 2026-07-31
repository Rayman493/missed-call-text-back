-- Allow the full set of AI finalization outcomes used by the voice service
-- and the outcome-classifier. The previous constraint was missing
-- partial_intake, early_hangup, no_speech, completed_intake, and
-- ai_connection_failed, which caused finalization failures for
-- incomplete, partial, and early-disconnected calls.

ALTER TABLE ai_call_records DROP CONSTRAINT IF EXISTS ai_call_records_outcome_check;

ALTER TABLE ai_call_records
ADD CONSTRAINT ai_call_records_outcome_check
CHECK (outcome IN (
    'completed',
    'completed_intake',
    'caller_hung_up',
    'ai_failed',
    'voicemail_fallback',
    'incomplete',
    'partial_intake',
    'early_hangup',
    'no_speech',
    'ai_connection_failed'
));

COMMENT ON COLUMN ai_call_records.outcome IS 'Call outcome: completed, completed_intake, caller_hung_up, ai_failed, voicemail_fallback, incomplete, partial_intake, early_hangup, no_speech, ai_connection_failed';
