-- Migration: add scheduled_end_time to jobs
--
-- Adds a nullable end-time column to the jobs table so users can record
-- an explicit end time for a job. This is backwards-compatible:
--   * Historical jobs with NULL scheduled_end_time remain valid.
--   * No backfill is performed — NULL means "end time not specified".
--   * Existing +1-hour fallback logic in the Google Calendar sync path
--     continues to apply when scheduled_end_time is NULL.
--
-- Same-day constraint: this column stores a time-of-day (no date
-- component). Overnight jobs that span midnight are NOT supported by
-- this column in the current batch; the existing scheduled_date is
-- assumed to be the date for both start and end.

alter table jobs
  add column if not exists scheduled_end_time time;
