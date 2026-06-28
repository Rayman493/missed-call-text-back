-- Add paused columns to follow_up_jobs table
-- These columns are needed for pausing/cancelling follow-up jobs when a lead is deleted or ignored
ALTER TABLE follow_up_jobs 
ADD COLUMN IF NOT EXISTS paused_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS paused_by text NULL;
