-- Create offboarding tracking table
-- This table tracks businesses that have deleted their accounts
-- to ensure they disable call forwarding

CREATE TABLE IF NOT EXISTS offboarding_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_phone_number TEXT NOT NULL,
  business_email TEXT NOT NULL,
  deletion_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  forwarding_confirmed BOOLEAN DEFAULT FALSE,
  reminder_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  confirmation_token TEXT UNIQUE, -- Token for confirmation link
  confirmed_at TIMESTAMP WITH TIME ZONE, -- When forwarding was confirmed
  last_reminder_at TIMESTAMP WITH TIME ZONE, -- When last reminder was sent
  business_id UUID, -- Original business ID for reference (soft delete reference)
  user_id UUID, -- Original user ID for reference
  twilio_phone_number TEXT, -- ReplyFlow number that was assigned
  CONSTRAINT confirmation_token_unique UNIQUE (confirmation_token)
);

-- Create index on confirmation_token for fast lookups
CREATE INDEX IF NOT EXISTS idx_offboarding_tracking_confirmation_token ON offboarding_tracking(confirmation_token);

-- Create index on business_email for reminder lookups
CREATE INDEX IF NOT EXISTS idx_offboarding_tracking_business_email ON offboarding_tracking(business_email);

-- Create index on forwarding_confirmed to find unconfirmed records
CREATE INDEX IF NOT EXISTS idx_offboarding_tracking_forwarding_confirmed ON offboarding_tracking(forwarding_confirmed);

-- Create index on deletion_timestamp for cleanup jobs
CREATE INDEX IF NOT EXISTS idx_offboarding_tracking_deletion_timestamp ON offboarding_tracking(deletion_timestamp);

-- Create index on last_reminder_at for reminder scheduler
CREATE INDEX IF NOT EXISTS idx_offboarding_tracking_last_reminder_at ON offboarding_tracking(last_reminder_at);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_offboarding_tracking_updated_at
  BEFORE UPDATE ON offboarding_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE offboarding_tracking IS 'Tracks businesses that have deleted their accounts to ensure call forwarding is disabled';
COMMENT ON COLUMN offboarding_tracking.forwarding_confirmed IS 'Whether the business has confirmed they disabled call forwarding';
COMMENT ON COLUMN offboarding_tracking.reminder_count IS 'Number of reminders sent (0-2 max)';
COMMENT ON COLUMN offboarding_tracking.confirmation_token IS 'Unique token for confirmation link';
COMMENT ON COLUMN offboarding_tracking.confirmed_at IS 'Timestamp when forwarding was confirmed';
COMMENT ON COLUMN offboarding_tracking.last_reminder_at IS 'Timestamp when last reminder was sent';
