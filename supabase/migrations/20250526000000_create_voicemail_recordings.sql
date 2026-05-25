-- Create voicemail_recordings table for V1 voicemail capture
-- Migration: 20250526000000_create_voicemail_recordings.sql

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create voicemail_recordings table
CREATE TABLE IF NOT EXISTS voicemail_recordings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
    call_sid TEXT NOT NULL,
    recording_sid TEXT NOT NULL,
    recording_url TEXT NOT NULL,
    recording_duration INTEGER,
    recording_status TEXT NOT NULL,
    transcription_text TEXT,
    transcription_status TEXT,
    caller_phone TEXT NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_voicemail_recordings_business_id ON voicemail_recordings(business_id);
CREATE INDEX IF NOT EXISTS idx_voicemail_recordings_lead_id ON voicemail_recordings(lead_id);
CREATE INDEX IF NOT EXISTS idx_voicemail_recordings_conversation_id ON voicemail_recordings(conversation_id);
CREATE INDEX IF NOT EXISTS idx_voicemail_recordings_call_sid ON voicemail_recordings(call_sid);
CREATE INDEX IF NOT EXISTS idx_voicemail_recordings_recording_sid ON voicemail_recordings(recording_sid);
CREATE INDEX IF NOT EXISTS idx_voicemail_recordings_created_at ON voicemail_recordings(created_at);

-- Add RLS (Row Level Security) policies
ALTER TABLE voicemail_recordings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view voicemail recordings for their own businesses
CREATE POLICY "Users can view voicemail recordings for their businesses"
    ON voicemail_recordings
    FOR SELECT
    USING (
        business_id IN (
            SELECT id FROM businesses 
            WHERE owner_id = auth.uid()
        )
    );

-- Policy: System can insert voicemail recordings (for Twilio webhooks)
CREATE POLICY "System can insert voicemail recordings"
    ON voicemail_recordings
    FOR INSERT
    WITH CHECK (true);

-- Policy: System can update voicemail recordings (for status callbacks)
CREATE POLICY "System can update voicemail recordings"
    ON voicemail_recordings
    FOR UPDATE
    WITH CHECK (true);

-- Policy: Users can update voicemail recordings for their own businesses
CREATE POLICY "Users can update voicemail recordings for their businesses"
    ON voicemail_recordings
    FOR UPDATE
    USING (
        business_id IN (
            SELECT id FROM businesses 
            WHERE owner_id = auth.uid()
        )
    );

-- Policy: Users can delete voicemail recordings for their own businesses
CREATE POLICY "Users can delete voicemail recordings for their businesses"
    ON voicemail_recordings
    FOR DELETE
    USING (
        business_id IN (
            SELECT id FROM businesses 
            WHERE owner_id = auth.uid()
        )
    );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_voicemail_recordings_updated_at
    BEFORE UPDATE ON voicemail_recordings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
