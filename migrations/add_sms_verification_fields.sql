-- Add SMS verification tracking columns to businesses table
-- Migration: add_sms_verification_fields.sql

-- Add sms_type column to track phone number type (e.g., 'toll_free', 'local', 'short_code')
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS sms_type TEXT;

-- Add a2p_status column to track 10DLC/A2P verification status
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS a2p_status TEXT;

-- Add comments for documentation
COMMENT ON COLUMN businesses.sms_type IS 'Type of SMS phone number (e.g., toll_free, local, short_code)';
COMMENT ON COLUMN businesses.a2p_status IS 'A2P/10DLC verification status (e.g., pending, verified, approved, rejected)';
