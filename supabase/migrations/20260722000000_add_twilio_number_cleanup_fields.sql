-- Add fields to support automated Twilio number cleanup
-- This migration adds support for tracking released numbers and cleanup runs

-- Add 'released' status to the status constraint
ALTER TABLE twilio_numbers DROP CONSTRAINT IF EXISTS twilio_numbers_status_check;

ALTER TABLE twilio_numbers 
ADD CONSTRAINT twilio_numbers_status_check 
CHECK (status IN ('active', 'released', 'error', 'available', 'assigned', 'failed', 'quarantined', 'retired', 'release_pending'));

-- Add release tracking fields to twilio_numbers
ALTER TABLE twilio_numbers 
ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS released_reason TEXT,
ADD COLUMN IF NOT EXISTS release_attempt_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_release_attempt_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_release_error TEXT,
ADD COLUMN IF NOT EXISTS cleanup_run_id UUID,
ADD COLUMN IF NOT EXISTS next_release_retry_at TIMESTAMPTZ;

-- Add comments for new fields
COMMENT ON COLUMN twilio_numbers.released_at IS 'Timestamp when number was released from Twilio account';
COMMENT ON COLUMN twilio_numbers.released_reason IS 'Reason for release (e.g., cleanup, manual)';
COMMENT ON COLUMN twilio_numbers.release_attempt_count IS 'Number of release attempts made';
COMMENT ON COLUMN twilio_numbers.last_release_attempt_at IS 'Timestamp of last release attempt';
COMMENT ON COLUMN twilio_numbers.last_release_error IS 'Last error encountered during release attempt';
COMMENT ON COLUMN twilio_numbers.cleanup_run_id IS 'ID of the cleanup run that processed this number';
COMMENT ON COLUMN twilio_numbers.next_release_retry_at IS 'Timestamp when next retry should be attempted';
COMMENT ON COLUMN twilio_numbers.retired_at IS 'Timestamp when number was marked as retired (blocked from reassignment)';

-- Create cleanup_runs audit table
CREATE TABLE IF NOT EXISTS twilio_number_cleanup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'live')),
  retired_count INTEGER NOT NULL DEFAULT 0,
  eligible_count INTEGER NOT NULL DEFAULT 0,
  selected_count INTEGER NOT NULL DEFAULT 0,
  released_count INTEGER NOT NULL DEFAULT 0,
  already_missing_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  trigger_source TEXT,
  deployment_environment TEXT,
  summary TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes for cleanup queries
CREATE INDEX IF NOT EXISTS idx_twilio_numbers_status_retired_at ON twilio_numbers(status, retired_at) WHERE status IN ('retired', 'release_pending');
CREATE INDEX IF NOT EXISTS idx_twilio_numbers_cleanup_run_id ON twilio_numbers(cleanup_run_id) WHERE cleanup_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_twilio_numbers_next_release_retry_at ON twilio_numbers(next_release_retry_at) WHERE next_release_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_twilio_number_cleanup_runs_started_at ON twilio_number_cleanup_runs(started_at DESC);

-- Add comments for cleanup_runs table
COMMENT ON TABLE twilio_number_cleanup_runs IS 'Audit trail for automated Twilio number cleanup runs';
COMMENT ON COLUMN twilio_number_cleanup_runs.mode IS 'dry_run or live execution';
COMMENT ON COLUMN twilio_number_cleanup_runs.retired_count IS 'Total retired numbers at start of run';
COMMENT ON COLUMN twilio_number_cleanup_runs.eligible_count IS 'Numbers meeting all eligibility criteria';
COMMENT ON COLUMN twilio_number_cleanup_runs.selected_count IS 'Numbers selected for release in this batch';
COMMENT ON COLUMN twilio_number_cleanup_runs.released_count IS 'Numbers successfully released from Twilio';
COMMENT ON COLUMN twilio_number_cleanup_runs.already_missing_count IS 'Numbers already missing from Twilio account';
COMMENT ON COLUMN twilio_number_cleanup_runs.failed_count IS 'Numbers that failed to release';
COMMENT ON COLUMN twilio_number_cleanup_runs.skipped_count IS 'Numbers skipped due to safety checks';
COMMENT ON COLUMN twilio_number_cleanup_runs.trigger_source IS 'Source of trigger (cron, manual, etc.)';
COMMENT ON COLUMN twilio_number_cleanup_runs.deployment_environment IS 'Environment where run occurred (production, staging)';