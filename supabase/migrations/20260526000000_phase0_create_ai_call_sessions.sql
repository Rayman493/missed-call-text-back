-- Phase 0: Create ai_call_sessions table for QA prototype
-- Migration: 20260526000000_phase0_create_ai_call_sessions.sql
-- Purpose: Store AI call session data for QA testing only
-- Safety: Feature-flagged, does not affect existing voicemail flow

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ai_call_sessions table
CREATE TABLE IF NOT EXISTS ai_call_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
    call_sid TEXT NOT NULL UNIQUE,
    openai_session_id TEXT,
    
    -- Session Status
    status TEXT NOT NULL CHECK (status IN (
        'started',
        'connected',
        'in_conversation',
        'completed',
        'failed',
        'timed_out',
        'fallback_voicemail',
        'caller_hungup'
    )),
    
    -- Fallback Information
    fallback_stage TEXT CHECK (fallback_stage IN (
        'guard_failed',
        'websocket_connect',
        'openai_connect',
        'conversation',
        'extraction',
        'completion'
    )),
    
    -- Timing
    started_at timestamptz DEFAULT now() NOT NULL,
    connected_at timestamptz,
    ended_at timestamptz,
    duration_seconds INTEGER,
    
    -- AI Output
    transcript TEXT,
    summary TEXT,
    
    -- Extracted Information
    caller_name TEXT,
    reason_for_call TEXT,
    urgency TEXT CHECK (urgency IN ('high', 'medium', 'low', 'unknown')),
    callback_number TEXT,
    
    -- Error Information
    error_message TEXT,
    
    -- Metadata
    raw_metadata jsonb,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for performance and queries
CREATE INDEX IF NOT EXISTS idx_ai_call_sessions_business_id ON ai_call_sessions(business_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_sessions_lead_id ON ai_call_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_sessions_call_sid ON ai_call_sessions(call_sid);
CREATE INDEX IF NOT EXISTS idx_ai_call_sessions_status ON ai_call_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ai_call_sessions_created_at ON ai_call_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_call_sessions_started_at ON ai_call_sessions(started_at);

-- RLS (Row Level Security) Policies
ALTER TABLE ai_call_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view AI sessions for their own businesses
CREATE POLICY "Users can view AI sessions for their businesses"
    ON ai_call_sessions
    FOR SELECT
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE owner_id = auth.uid()
        )
    );

-- Policy: System can insert AI sessions (for Twilio webhooks)
CREATE POLICY "System can insert AI sessions"
    ON ai_call_sessions
    FOR INSERT
    WITH CHECK (true);

-- Policy: System can update AI sessions (for status callbacks)
CREATE POLICY "System can update AI sessions"
    ON ai_call_sessions
    FOR UPDATE
    WITH CHECK (true);

-- Policy: System can delete AI sessions
CREATE POLICY "System can delete AI sessions"
    ON ai_call_sessions
    FOR DELETE
    WITH CHECK (true);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ai_call_sessions_updated_at
    BEFORE UPDATE ON ai_call_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comment for documentation
COMMENT ON TABLE ai_call_sessions IS 'Phase 0: AI call session data for QA testing. Feature-flagged, does not affect production flow.';
COMMENT ON COLUMN ai_call_sessions.call_sid IS 'Twilio Call SID - unique constraint prevents duplicate sessions';
COMMENT ON COLUMN ai_call_sessions.status IS 'Session lifecycle status';
COMMENT ON COLUMN ai_call_sessions.fallback_stage IS 'Stage where fallback to voicemail occurred (if any)';
