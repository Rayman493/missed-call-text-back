-- Add forwarding_phone_number field to businesses table
-- Migration: 005_add_forwarding_phone_number_to_businesses.sql

-- Add forwarding_phone_number column for business phone setup flow
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS forwarding_phone_number text;

-- Add comment for documentation
COMMENT ON COLUMN businesses.forwarding_phone_number IS 'Business phone number for call forwarding setup';
