-- Add fields to support automated stuck provisioning recovery
-- This migration adds support for tracking recovery attempts for stuck provisioning states

-- Add recovery tracking fields to twilio_numbers
ALTER TABLE twilio_numbers
ADD COLUMN IF NOT EXISTS recovery_attempt_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_recovery_attempt_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_recovery_error TEXT,
ADD COLUMN IF NOT EXISTS next_recovery_retry_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS recovery_run_id UUID;

-- Add comments for new fields
COMMENT ON COLUMN twilio_numbers.recovery_attempt_count IS 'Number of recovery attempts made for stuck provisioning';
COMMENT ON COLUMN twilio_numbers.last_recovery_attempt_at IS 'Timestamp of last recovery attempt';
COMMENT ON COLUMN twilio_numbers.last_recovery_error IS 'Last error encountered during recovery attempt';
COMMENT ON COLUMN twilio_numbers.next_recovery_retry_at IS 'Timestamp when next recovery retry should be attempted (exponential backoff)';
COMMENT ON COLUMN twilio_numbers.recovery_run_id IS 'ID of the recovery run that processed this number (for overlap protection)';

-- Create recovery_runs audit table
CREATE TABLE IF NOT EXISTS provisioning_recovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  stuck_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  recovered_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  trigger_source TEXT,
  deployment_environment TEXT,
  summary TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes for recovery queries
CREATE INDEX IF NOT EXISTS idx_twilio_numbers_provisioning_status_recovery ON twilio_numbers(provisioning_status, last_provisioning_attempt_at) 
WHERE provisioning_status IN ('campaign_registering', 'campaign_registered', 'sender_pool_attaching', 'purchasing');
CREATE INDEX IF NOT EXISTS idx_twilio_numbers_recovery_run_id ON twilio_numbers(recovery_run_id) WHERE recovery_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_twilio_numbers_next_recovery_retry_at ON twilio_numbers(next_recovery_retry_at) WHERE next_recovery_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_provisioning_recovery_runs_started_at ON provisioning_recovery_runs(started_at DESC);

-- Add comments for recovery_runs table
COMMENT ON TABLE provisioning_recovery_runs IS 'Audit trail for automated stuck provisioning recovery runs';
COMMENT ON COLUMN provisioning_recovery_runs.stuck_count IS 'Total numbers stuck in provisioning states at start of run';
COMMENT ON COLUMN provisioning_recovery_runs.processed_count IS 'Numbers processed in this run';
COMMENT ON COLUMN provisioning_recovery_runs.recovered_count IS 'Numbers successfully recovered';
COMMENT ON COLUMN provisioning_recovery_runs.failed_count IS 'Numbers that failed recovery (marked as failed)';
COMMENT ON COLUMN provisioning_recovery_runs.skipped_count IS 'Numbers skipped (e.g., not stuck, recently attempted)';
COMMENT ON COLUMN provisioning_recovery_runs.trigger_source IS 'Source of trigger (cron, manual, etc.)';
COMMENT ON COLUMN provisioning_recovery_runs.deployment_environment IS 'Environment where run occurred (production, staging)';