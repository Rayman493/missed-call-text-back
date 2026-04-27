-- Add cancellation tracking columns to follow_up_jobs table
-- Migration: add_follow_up_jobs_cancel_fields.sql

-- Drop the existing check constraint
ALTER TABLE follow_up_jobs DROP CONSTRAINT IF EXISTS follow_up_jobs_status_check;

-- Add new check constraint that includes 'cancelled' status
ALTER TABLE follow_up_jobs 
ADD CONSTRAINT follow_up_jobs_status_check 
CHECK (status in ('pending', 'sent', 'failed', 'cancelled'));

-- Add cancellation reason column
ALTER TABLE follow_up_jobs 
ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

-- Add cancellation timestamp column
ALTER TABLE follow_up_jobs 
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Add comments for documentation
COMMENT ON COLUMN follow_up_jobs.cancelled_reason IS 'Reason why the follow-up job was cancelled (e.g., customer_replied, customer_opted_out)';
COMMENT ON COLUMN follow_up_jobs.cancelled_at IS 'Timestamp when the follow-up job was cancelled';
