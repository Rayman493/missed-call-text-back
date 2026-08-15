-- Add stale provisioning lock cleanup function
-- This prevents businesses from getting stuck in 'provisioning' status
-- if a provisioning process crashes while holding a lock

-- Create function to release stale locks
CREATE OR REPLACE FUNCTION release_stale_provisioning_locks()
RETURNS TABLE(
  business_id uuid,
  previous_status text,
  previous_lock_id text,
  lock_age_minutes numeric
) AS $$
DECLARE
  stale_threshold INTERVAL := interval '30 minutes';
BEGIN
  RETURN QUERY
  UPDATE businesses
  SET provisioning_status = 'failed',
      provisioning_lock_id = NULL,
      provisioning_error = 'Stale lock - automatic cleanup (process likely crashed)',
      last_provisioning_attempt_at = now()
  WHERE provisioning_status = 'provisioning'
    AND provisioning_lock_id IS NOT NULL
    AND last_provisioning_attempt_at < now() - stale_threshold
  RETURNING
    id as business_id,
    'provisioning' as previous_status,
    provisioning_lock_id as previous_lock_id,
    EXTRACT(EPOCH FROM (now() - last_provisioning_attempt_at)) / 60 as lock_age_minutes;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION release_stale_provisioning_locks TO authenticated, anon, service_role;

-- Add comment explaining the function
COMMENT ON FUNCTION release_stale_provisioning_locks IS 'Automatically releases stale provisioning locks older than 30 minutes to prevent businesses from getting stuck in provisioning status';

-- Create a log table for stale lock cleanup events
CREATE TABLE IF NOT EXISTS stale_lock_cleanup_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  previous_lock_id text,
  lock_age_minutes numeric,
  cleaned_at timestamptz DEFAULT now(),
  CONSTRAINT fk_stale_lock_cleanup_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

-- Grant permissions
GRANT SELECT, INSERT ON stale_lock_cleanup_log TO authenticated, anon, service_role;

-- Create index for querying
CREATE INDEX IF NOT EXISTS idx_stale_lock_cleanup_log_business_id ON stale_lock_cleanup_log(business_id);
CREATE INDEX IF NOT EXISTS idx_stale_lock_cleanup_log_cleaned_at ON stale_lock_cleanup_log(cleaned_at DESC);

-- Add comment
COMMENT ON TABLE stale_lock_cleanup_log IS 'Log of stale provisioning lock cleanup events for auditing and monitoring';