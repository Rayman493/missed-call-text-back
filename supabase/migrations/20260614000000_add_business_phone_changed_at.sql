-- Add business_phone_changed_at field to businesses table
-- This field tracks when the business phone number was last changed for cooldown enforcement

ALTER TABLE businesses 
ADD COLUMN business_phone_changed_at TIMESTAMPTZ;

-- Add index for performance
CREATE INDEX idx_businesses_business_phone_changed_at ON businesses(business_phone_changed_at);

-- Add comment
COMMENT ON COLUMN businesses.business_phone_changed_at IS 'Timestamp when the business phone number was last changed. Used for 7-day cooldown enforcement on phone number changes.';
