-- Add service_location_type column to businesses table
-- Supported values: 'onsite', 'customer_comes_to_business', 'remote'
-- Rollout strategy: additive only; existing businesses retain current behavior
-- Application code must normalize null/undefined/invalid values to 'onsite'

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS service_location_type TEXT;

COMMENT ON COLUMN businesses.service_location_type IS 'Service location mode: onsite | customer_comes_to_business | remote';
