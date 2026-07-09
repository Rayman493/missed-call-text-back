-- Add google_calendar_event_id column to jobs table
-- This links jobs to their corresponding Google Calendar events
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_jobs_google_calendar_event_id ON jobs(google_calendar_event_id);

-- Add comment
COMMENT ON COLUMN jobs.google_calendar_event_id IS 'Google Calendar event ID for scheduled jobs';
