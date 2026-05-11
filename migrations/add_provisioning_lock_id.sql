-- Add provisioning_lock_id field to businesses table
-- Migration: add_provisioning_lock_id.sql

-- Add provisioning_lock_id field for correlation-based locking
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS provisioning_lock_id text;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_businesses_provisioning_lock_id ON businesses(provisioning_lock_id);

-- Comment for documentation
COMMENT ON COLUMN businesses.provisioning_lock_id IS 'Correlation ID for provisioning lock - prevents self-blocking';
