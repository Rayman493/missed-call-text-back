-- Add missing columns to offboarding_tracking table in production
-- These columns exist in the migration schema but are missing in production

-- Add deletion_timestamp column (NOT NULL, default to created_at for existing records)
ALTER TABLE offboarding_tracking 
ADD COLUMN IF NOT EXISTS deletion_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

-- Update existing records to have deletion_timestamp = created_at
UPDATE offboarding_tracking 
SET deletion_timestamp = created_at 
WHERE deletion_timestamp IS NULL OR deletion_timestamp = NOW();

-- Add twilio_phone_number column
ALTER TABLE offboarding_tracking 
ADD COLUMN IF NOT EXISTS twilio_phone_number TEXT;

-- Add comment for deletion_timestamp
COMMENT ON COLUMN offboarding_tracking.deletion_timestamp IS 'Timestamp when the business deleted their account';

-- Add comment for twilio_phone_number
COMMENT ON COLUMN offboarding_tracking.twilio_phone_number IS 'ReplyFlow number that was assigned to the business';
