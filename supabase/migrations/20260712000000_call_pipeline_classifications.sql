-- Call Pipeline Classifications Table
-- Stores temporary CallSid routing classifications to enable durable pipeline detection
-- across all Twilio callbacks (voice, voice-status, recording-status, personal-voicemail)
-- without creating customer/lead/conversation records for Personal Voicemail calls

CREATE TABLE IF NOT EXISTS call_pipeline_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sid TEXT NOT NULL UNIQUE,
  business_id UUID NOT NULL,
  caller_phone TEXT NOT NULL,
  pipeline TEXT NOT NULL, -- 'personal_voicemail', 'ai_intake', 'normal_voicemail', etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  
  -- Indexes for fast lookup by CallSid
  CONSTRAINT call_pipeline_classifications_call_sid_key UNIQUE (call_sid)
);

-- Index for fast CallSid lookup
CREATE INDEX IF NOT EXISTS idx_call_pipeline_classifications_call_sid 
  ON call_pipeline_classifications(call_sid);

-- Index for expiry cleanup
CREATE INDEX IF NOT EXISTS idx_call_pipeline_classifications_expires_at 
  ON call_pipeline_classifications(expires_at);

-- Index for business cleanup
CREATE INDEX IF NOT EXISTS idx_call_pipeline_classifications_business_id 
  ON call_pipeline_classifications(business_id);

-- Function to clean up expired classifications
CREATE OR REPLACE FUNCTION cleanup_expired_call_classifications()
RETURNS void AS $$
BEGIN
  DELETE FROM call_pipeline_classifications 
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Enable periodic cleanup (run every 5 minutes)
-- Note: This requires pg_cron extension, which may not be available
-- Alternative: Clean up on read/write operations instead

-- Comment for documentation
COMMENT ON TABLE call_pipeline_classifications IS 'Temporary CallSid routing classifications for durable pipeline detection across Twilio callbacks';
COMMENT ON COLUMN call_pipeline_classifications.pipeline IS 'Pipeline type: personal_voicemail, ai_intake, normal_voicemail, etc.';
COMMENT ON COLUMN call_pipeline_classifications.expires_at IS 'Classification expiry - automatically cleaned up after 10 minutes';
