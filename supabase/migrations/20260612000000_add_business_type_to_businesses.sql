-- Add business_type column to businesses table
-- This allows businesses to specify their type (HVAC, plumber, dog groomer, etc.)
-- for more relevant AI voice assistant context

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS business_type TEXT;

-- Add comment for documentation
COMMENT ON COLUMN businesses.business_type IS 'Type of business (e.g., HVAC, plumber, dog groomer) for AI context';
