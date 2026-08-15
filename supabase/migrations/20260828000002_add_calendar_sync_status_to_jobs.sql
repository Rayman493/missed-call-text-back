-- Add calendar sync status tracking to jobs table
-- This addresses the medium-priority gap where Google Calendar sync failures were silent
-- Jobs can now track their calendar sync status independently of their existence

-- Add calendar sync status column
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS calendar_sync_status TEXT CHECK (calendar_sync_status IN ('pending', 'synced', 'failed', 'not_required')) DEFAULT 'not_required';

-- Add calendar sync error column for failure details
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS calendar_sync_error TEXT;

-- Add calendar sync attempt timestamp
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS calendar_last_sync_attempt_at TIMESTAMPTZ;

-- Add calendar sync success timestamp
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS calendar_last_synced_at TIMESTAMPTZ;

-- Add index for querying jobs by sync status
CREATE INDEX IF NOT EXISTS idx_jobs_calendar_sync_status ON jobs(calendar_sync_status);

-- Add index for querying failed syncs
CREATE INDEX IF NOT EXISTS idx_jobs_calendar_sync_failed ON jobs(calendar_sync_status, calendar_last_sync_attempt_at DESC) WHERE calendar_sync_status = 'failed';

-- Add comments
COMMENT ON COLUMN jobs.calendar_sync_status IS 'Google Calendar sync status: pending (in progress), synced (success), failed (error), not_required (no calendar connected)';
COMMENT ON COLUMN jobs.calendar_sync_error IS 'Error message if calendar sync failed, null if successful or not required';
COMMENT ON COLUMN jobs.calendar_last_sync_attempt_at IS 'Timestamp of the most recent calendar sync attempt';
COMMENT ON COLUMN jobs.calendar_last_synced_at IS 'Timestamp of the most recent successful calendar sync';

-- Add function to update calendar sync status
CREATE OR REPLACE FUNCTION update_job_calendar_sync_status(
  p_job_id UUID,
  p_status TEXT,
  p_error TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  UPDATE jobs
  SET
    calendar_sync_status = p_status,
    calendar_sync_error = p_error,
    calendar_last_sync_attempt_at = NOW(),
    calendar_last_synced_at = CASE
      WHEN p_status = 'synced' THEN NOW()
      ELSE calendar_last_synced_at
    END,
    updated_at = NOW()
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_job_calendar_sync_status TO authenticated, service_role;