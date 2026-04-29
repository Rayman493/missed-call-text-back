-- Make twilio_phone_number nullable to allow new accounts without assigned Twilio numbers
-- This fixes the duplicate key constraint error for new onboarding accounts

-- Drop the unique constraint temporarily
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_twilio_phone_number_key;

-- Make the column nullable
ALTER TABLE businesses ALTER COLUMN twilio_phone_number DROP NOT NULL;

-- Add back the unique constraint that allows multiple NULLs
ALTER TABLE businesses ADD CONSTRAINT businesses_twilio_phone_number_key UNIQUE (twilio_phone_number);

-- Add index for efficient lookups of assigned numbers
CREATE INDEX IF NOT EXISTS idx_businesses_twilio_phone_assigned ON businesses(twilio_phone_number) WHERE twilio_phone_number IS NOT NULL;
