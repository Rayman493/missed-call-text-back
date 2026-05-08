-- Add provisioning lifecycle fields to businesses table
-- Migration: add_provisioning_lifecycle_fields.sql

-- Add provisioning_status field
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS provisioning_status text default 'pending';

-- Add provisioning_error field
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS provisioning_error text;

-- Add provisioned_at field
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS provisioned_at timestamptz;

-- Comments for documentation
COMMENT ON COLUMN businesses.provisioning_status IS 'Provisioning status: pending, provisioning, active, failed';
COMMENT ON COLUMN businesses.provisioning_error IS 'Error message if provisioning failed';
COMMENT ON COLUMN businesses.provisioned_at IS 'Timestamp when Twilio number was successfully provisioned';
