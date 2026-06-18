-- Add Out of Office Mode fields to businesses table
-- Allows businesses to temporarily mark themselves as unavailable (vacations, holidays, closures)

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS out_of_office_enabled BOOLEAN DEFAULT false;

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS out_of_office_start TIMESTAMPTZ NULL;

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS out_of_office_end TIMESTAMPTZ NULL;

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS out_of_office_message TEXT NULL;

-- Add comments for documentation
COMMENT ON COLUMN businesses.out_of_office_enabled IS 'Whether Out of Office Mode is currently enabled';
COMMENT ON COLUMN businesses.out_of_office_start IS 'Start date/time for Out of Office Mode';
COMMENT ON COLUMN businesses.out_of_office_end IS 'End date/time for Out of Office Mode';
COMMENT ON COLUMN businesses.out_of_office_message IS 'Custom message to send during Out of Office Mode (supports {{business_name}} placeholder)';

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_businesses_out_of_office_enabled ON businesses(out_of_office_enabled) WHERE out_of_office_enabled = true;
