-- Add error tracking columns to follow_up_jobs table
-- Migration: 001_add_follow_up_jobs_error_fields.sql

ALTER TABLE follow_up_jobs 
ADD COLUMN IF NOT EXISTS last_error_message TEXT,
ADD COLUMN IF NOT EXISTS last_error_code TEXT;

-- Add comment for documentation
COMMENT ON COLUMN follow_up_jobs.last_error_message IS 'Stores the last error message when a follow-up job fails';
COMMENT ON COLUMN follow_up_jobs.last_error_code IS 'Stores the last error code when a follow-up job fails';
