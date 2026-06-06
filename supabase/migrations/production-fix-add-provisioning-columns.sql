-- PRODUCTION FIX: Add missing provisioning columns to businesses table
-- Run this script directly in production Supabase SQL Editor
-- This script adds columns expected by the Twilio provisioning service

-- Add twilio_phone_number column if it doesn't exist
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS twilio_phone_number text;

-- Add twilio_phone_number_sid column if it doesn't exist
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS twilio_phone_number_sid text;

-- Add twilio_messaging_service_sid column if it doesn't exist
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS twilio_messaging_service_sid text;

-- Add provisioning_status column if it doesn't exist
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS provisioning_status text DEFAULT 'pending';

-- Add provisioning_error column if it doesn't exist
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS provisioning_error text;

-- Add provisioning_lock_id column if it doesn't exist (for preventing concurrent provisioning)
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS provisioning_lock_id text;

-- Add last_provisioning_attempt_at column if it doesn't exist
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS last_provisioning_attempt_at timestamptz;

-- Add provisioned_at column if it doesn't exist
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS provisioned_at timestamptz;

-- Add campaign_registered_at column if it doesn't exist
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS campaign_registered_at timestamptz;

-- Add sender_pool_attached_at column if it doesn't exist
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS sender_pool_attached_at timestamptz;

-- Add comments for documentation
COMMENT ON COLUMN businesses.twilio_phone_number IS 'Twilio phone number assigned to this business';
COMMENT ON COLUMN businesses.twilio_phone_number_sid IS 'Twilio SID for the assigned phone number';
COMMENT ON COLUMN businesses.twilio_messaging_service_sid IS 'Twilio messaging service SID for A2P 10DLC';
COMMENT ON COLUMN businesses.provisioning_status IS 'Current status of Twilio number provisioning (pending, purchasing, purchased, campaign_registering, campaign_registered, sender_pool_attaching, ready, failed)';
COMMENT ON COLUMN businesses.provisioning_error IS 'Error message if provisioning failed';
COMMENT ON COLUMN businesses.provisioning_lock_id IS 'Lock ID to prevent concurrent provisioning attempts';
COMMENT ON COLUMN businesses.last_provisioning_attempt_at IS 'Timestamp of the last provisioning attempt';
COMMENT ON COLUMN businesses.provisioned_at IS 'Timestamp when provisioning completed successfully';
COMMENT ON COLUMN businesses.campaign_registered_at IS 'Timestamp when number was registered to A2P campaign';
COMMENT ON COLUMN businesses.sender_pool_attached_at IS 'Timestamp when number was attached to messaging service sender pool';

-- Verification query
SELECT column_name, 
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'businesses' AND column_name = column_name) as exists
FROM (VALUES 
  ('twilio_phone_number'),
  ('twilio_phone_number_sid'),
  ('twilio_messaging_service_sid'),
  ('provisioning_status'),
  ('provisioning_error'),
  ('provisioning_lock_id'),
  ('last_provisioning_attempt_at'),
  ('provisioned_at'),
  ('campaign_registered_at'),
  ('sender_pool_attached_at')
) AS t(column_name);
