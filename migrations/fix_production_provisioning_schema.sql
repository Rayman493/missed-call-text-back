-- Fix production provisioning schema mismatch
-- Migration: fix_production_provisioning_schema.sql

-- Add missing provisioning columns to businesses table
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS provisioning_lock_id text;

-- Add index for provisioning_lock_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_businesses_provisioning_lock_id ON businesses(provisioning_lock_id);

-- Add missing columns that might be referenced in code
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS provisioned_at timestamptz;

-- Ensure all provisioning-related columns exist
DO $$
BEGIN
    -- Check each column and add if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'businesses' 
        AND column_name = 'provisioning_lock_id'
    ) THEN
        EXECUTE 'ALTER TABLE businesses ADD COLUMN IF NOT EXISTS provisioning_lock_id text';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'businesses' 
        AND column_name = 'provisioned_at'
    ) THEN
        EXECUTE 'ALTER TABLE businesses ADD COLUMN IF NOT EXISTS provisioned_at timestamptz';
    END IF;
END $$;

-- Comments for documentation
COMMENT ON COLUMN businesses.provisioning_lock_id IS 'Correlation ID for provisioning lock - prevents self-blocking';
COMMENT ON COLUMN businesses.provisioned_at IS 'Timestamp when Twilio number was successfully provisioned';
