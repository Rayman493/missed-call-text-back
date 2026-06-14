-- Add reserved status to twilio_numbers table
-- This allows marking numbers as reserved for a 30-day grace period after business deletion

-- Drop existing check constraint
ALTER TABLE twilio_numbers DROP CONSTRAINT IF EXISTS twilio_numbers_status_check;

-- Add new check constraint with reserved status
ALTER TABLE twilio_numbers 
ADD CONSTRAINT twilio_numbers_status_check 
CHECK (status IN ('active', 'released', 'error', 'retired', 'reserved', 'available'));

-- Add fields for reservation tracking
ALTER TABLE twilio_numbers 
ADD COLUMN IF NOT EXISTS reserved_for_business_id UUID,
ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reserved_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reservation_reason TEXT;

-- Add comments
COMMENT ON COLUMN twilio_numbers.status IS 'Number status: active (in use), released (deleted from Twilio), error (provisioning failed), retired (blocked from reassignment), reserved (30-day grace period after deletion), available (ready for assignment)';
COMMENT ON COLUMN twilio_numbers.reserved_for_business_id IS 'Business ID that previously owned this number, used for reclamation within grace period';
COMMENT ON COLUMN twilio_numbers.reserved_at IS 'When the number was reserved (start of grace period)';
COMMENT ON COLUMN twilio_numbers.reserved_expires_at IS 'When the reservation expires (30 days after reserved_at)';
COMMENT ON COLUMN twilio_numbers.reservation_reason IS 'Reason for reservation (e.g., account_deletion, test_business_data_reset, churn_grace_period_expired)';

-- Add index for efficient lookup of expired reservations
CREATE INDEX IF NOT EXISTS idx_twilio_numbers_reserved_expires_at ON twilio_numbers(reserved_expires_at) WHERE status = 'reserved';

-- Add index for efficient lookup of numbers reserved for a specific business
CREATE INDEX IF NOT EXISTS idx_twilio_numbers_reserved_for_business_id ON twilio_numbers(reserved_for_business_id) WHERE status = 'reserved';
