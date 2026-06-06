-- Add retired status to twilio_numbers table
-- This allows marking numbers as retired/blocked from reassignment

-- Drop existing check constraint
ALTER TABLE twilio_numbers DROP CONSTRAINT IF EXISTS twilio_numbers_status_check;

-- Add new check constraint with retired status
ALTER TABLE twilio_numbers 
ADD CONSTRAINT twilio_numbers_status_check 
CHECK (status IN ('active', 'released', 'error', 'retired'));

-- Add comment for the retired status
COMMENT ON COLUMN twilio_numbers.status IS 'Number status: active (in use), released (deleted from Twilio), error (provisioning failed), retired (blocked from reassignment)';
