-- Add warm number management statuses to twilio_numbers table
-- This supports automatic warm-number replenishment for onboarding reliability

-- Add new status values for warm number management
-- First, we need to drop the existing check constraints and recreate them with new values
ALTER TABLE twilio_numbers DROP CONSTRAINT IF EXISTS twilio_numbers_status_check;
ALTER TABLE twilio_numbers DROP CONSTRAINT IF EXISTS twilio_numbers_sms_status_check;

-- Recreate status check constraint with new values
ALTER TABLE twilio_numbers 
ADD CONSTRAINT twilio_numbers_status_check 
CHECK (status IN ('active', 'released', 'error', 'available', 'assigned', 'failed', 'quarantined'));

-- Recreate sms_status check constraint with new values
ALTER TABLE twilio_numbers 
ADD CONSTRAINT twilio_numbers_sms_status_check 
CHECK (sms_status IN ('pending', 'verified', 'failed', 'ready'));

-- Add comments for documentation
COMMENT ON COLUMN twilio_numbers.status IS 'Number status: active/released/error (legacy), available/assigned/failed/quarantined (warm number management)';
COMMENT ON COLUMN twilio_numbers.sms_status IS 'SMS status: pending/verified/failed (legacy), ready (warm number management)';
