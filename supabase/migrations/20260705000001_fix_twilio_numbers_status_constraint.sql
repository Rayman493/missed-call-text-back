-- Fix twilio_numbers status constraint to include all valid statuses
-- This resolves the warm inventory assignment bug where 'assigned' status was rejected
-- The constraint was previously overwritten by add_twilio_retired_status.sql which excluded warm number statuses

-- Drop existing check constraint
ALTER TABLE twilio_numbers DROP CONSTRAINT IF EXISTS twilio_numbers_status_check;

-- Add comprehensive check constraint with ALL valid statuses
-- Legacy statuses: active, released, error
-- Warm number management: available, assigned, failed, quarantined
-- Retired: retired
ALTER TABLE twilio_numbers 
ADD CONSTRAINT twilio_numbers_status_check 
CHECK (status IN ('active', 'released', 'error', 'available', 'assigned', 'failed', 'quarantined', 'retired'));

-- Update comment to reflect all statuses
COMMENT ON COLUMN twilio_numbers.status IS 'Number status: active (in use), released (deleted from Twilio), error (provisioning failed), available (warm inventory), assigned (warm inventory assigned to business), failed (warm inventory provisioning failed), quarantined (warm inventory quarantined), retired (blocked from reassignment)';
