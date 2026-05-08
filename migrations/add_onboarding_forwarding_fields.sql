-- Add onboarding forwarding fields to businesses table
-- Migration: add_onboarding_forwarding_fields.sql

-- Add business_phone_carrier field
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS business_phone_carrier text;

-- Add forwarding_verified field
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS forwarding_verified boolean default false;

-- Add forwarding_verified_at field
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS forwarding_verified_at timestamptz;

-- Comments for documentation
COMMENT ON COLUMN businesses.business_phone_carrier IS 'Carrier for business phone: Verizon, AT&T, T-Mobile, Other';
COMMENT ON COLUMN businesses.forwarding_verified IS 'Whether call forwarding has been verified through test call';
COMMENT ON COLUMN businesses.forwarding_verified_at IS 'Timestamp when forwarding was verified';
