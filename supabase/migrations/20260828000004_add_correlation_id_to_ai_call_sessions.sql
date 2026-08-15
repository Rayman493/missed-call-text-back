-- Add correlation_id to ai_call_sessions table for unified observability
-- This addresses the diagnostics gap where AI flow lacked explicit correlation ID
-- Call SID remains as primary identifier, correlation_id provides unified tracing

ALTER TABLE ai_call_sessions
ADD COLUMN IF NOT EXISTS correlation_id TEXT;

-- Add index for efficient querying by correlation_id
CREATE INDEX IF NOT EXISTS idx_ai_call_sessions_correlation_id ON ai_call_sessions(correlation_id);

-- Add comment
COMMENT ON COLUMN ai_call_sessions.correlation_id IS 'Unified correlation ID for tracing AI call lifecycle across all components (Twilio webhook, AI session, transcript, customer creation, notifications)';