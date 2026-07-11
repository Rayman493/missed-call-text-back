-- Create personal_voicemails table
-- This is a completely separate system from customers/leads
-- Used only for storing voicemails from ignored/personal callers
-- No CRM, no conversations, no AI, no SMS, no follow-ups

CREATE TABLE IF NOT EXISTS personal_voicemails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  caller_phone TEXT NOT NULL,
  caller_name TEXT,
  recording_url TEXT NOT NULL,
  recording_sid TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  transcription TEXT,
  listened_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT personal_voicemails_call_sid_unique UNIQUE (recording_sid)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_personal_voicemails_business_id ON personal_voicemails(business_id);
CREATE INDEX IF NOT EXISTS idx_personal_voicemails_caller_phone ON personal_voicemails(caller_phone);
CREATE INDEX IF NOT EXISTS idx_personal_voicemails_created_at ON personal_voicemails(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_voicemails_deleted_at ON personal_voicemails(deleted_at) WHERE deleted_at IS NULL;

-- Enable RLS
ALTER TABLE personal_voicemails ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Business users can only access their own voicemails
CREATE POLICY "Users can view their own personal voicemails"
  ON personal_voicemails FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own personal voicemails"
  ON personal_voicemails FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT id FROM businesses WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own personal voicemails"
  ON personal_voicemails FOR UPDATE
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own personal voicemails"
  ON personal_voicemails FOR DELETE
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE user_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_personal_voicemails_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER personal_voicemails_updated_at
  BEFORE UPDATE ON personal_voicemails
  FOR EACH ROW
  EXECUTE FUNCTION update_personal_voicemails_updated_at();

-- Add comment to table
COMMENT ON TABLE personal_voicemails IS 'Personal voicemail storage for ignored/personal callers - completely separate from customer system';
