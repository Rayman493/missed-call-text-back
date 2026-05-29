-- Create ai_call_failures table for Phase 6: Failure Reason Tracking
-- This table tracks AI call failures for reliability metrics and debugging

CREATE TABLE IF NOT EXISTS ai_call_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sid TEXT NOT NULL,
  business_id TEXT NOT NULL,
  failure_stage TEXT NOT NULL CHECK (failure_stage IN (
    'OPENAI_CONNECT_FAILED',
    'SESSION_READY_TIMEOUT', 
    'NO_AUDIO_RECEIVED',
    'CALLER_HUNG_UP',
    'VOICEMAIL_FALLBACK',
    'UNKNOWN'
  )),
  failure_reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes for performance
  INDEX idx_ai_call_failures_call_sid (call_sid),
  INDEX idx_ai_call_failures_business_id (business_id),
  INDEX idx_ai_call_failures_failure_stage (failure_stage),
  INDEX idx_ai_call_failures_created_at (created_at)
);

-- Add RLS policies (if needed)
ALTER TABLE ai_call_failures ENABLE ROW LEVEL SECURITY;

-- Policy for service account to insert failures
CREATE POLICY "Service can insert ai_call_failures" ON ai_call_failures
  FOR INSERT WITH CHECK (true);

-- Policy for service account to read failures
CREATE POLICY "Service can read ai_call_failures" ON ai_call_failures
  FOR SELECT USING (true);

-- Add comment
COMMENT ON TABLE ai_call_failures IS 'Tracks AI call failures for reliability metrics and debugging';
COMMENT ON COLUMN ai_call_failures.failure_stage IS 'Stage where the failure occurred';
COMMENT ON COLUMN ai_call_failures.failure_reason IS 'Detailed reason for the failure';
