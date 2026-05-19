-- Add business_email field to businesses table for abuse prevention
-- This allows tracking business emails for duplicate detection

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS business_email text;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_businesses_business_email ON businesses(business_email) WHERE business_email IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN businesses.business_email IS 'Business email address for abuse prevention and duplicate detection';
