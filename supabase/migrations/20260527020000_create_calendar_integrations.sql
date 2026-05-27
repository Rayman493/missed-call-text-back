-- Create calendar_integrations table
CREATE TABLE IF NOT EXISTS calendar_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMP WITH TIME ZONE,
  scope TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(business_id, provider)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_calendar_integrations_business_id ON calendar_integrations(business_id);

-- Enable RLS
ALTER TABLE calendar_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own calendar integrations"
  ON calendar_integrations
  FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM businesses
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own calendar integrations"
  ON calendar_integrations
  FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT id FROM businesses
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own calendar integrations"
  ON calendar_integrations
  FOR UPDATE
  USING (
    business_id IN (
      SELECT id FROM businesses
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own calendar integrations"
  ON calendar_integrations
  FOR DELETE
  USING (
    business_id IN (
      SELECT id FROM businesses
      WHERE user_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_calendar_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER set_calendar_integrations_updated_at
  BEFORE UPDATE ON calendar_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_calendar_integrations_updated_at();
