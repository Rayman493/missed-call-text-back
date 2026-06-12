-- Add business_type_other column to businesses table
-- This allows businesses to specify a custom business type when "Other" is selected

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS business_type_other TEXT;

-- Add comment for documentation
COMMENT ON COLUMN businesses.business_type_other IS 'Custom business type description when "Other" is selected (e.g., Pool Service, Wedding Photographer)';
