-- Add setup status fields to businesses table
-- Migration: 006_add_setup_status_fields_to_businesses.sql

-- Add setup_status column for tracking phone setup progress
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS setup_status text CHECK (setup_status IN ('not_configured', 'awaiting_test', 'working'));

-- Add setup_completed_at column for when setup was completed
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz;

-- Add comments for documentation
COMMENT ON COLUMN businesses.setup_status IS 'Phone setup status: not_configured, awaiting_test, working';
COMMENT ON COLUMN businesses.setup_completed_at IS 'Timestamp when phone setup was completed and tested';
