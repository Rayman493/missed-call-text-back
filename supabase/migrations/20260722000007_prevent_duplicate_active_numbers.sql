-- Add unique constraint to prevent multiple active/assigned numbers per business
-- This prevents race conditions where concurrent provisioning could assign multiple numbers to the same business

-- Create partial unique index: only one row per business where status is 'active' or 'assigned'
CREATE UNIQUE INDEX IF NOT EXISTS idx_twilio_numbers_business_active_unique
ON twilio_numbers(business_id)
WHERE business_id IS NOT NULL
  AND (status = 'active' OR status = 'assigned');

-- Add comment explaining the constraint
COMMENT ON INDEX idx_twilio_numbers_business_active_unique IS 'Prevents multiple active/assigned numbers per business - critical for provisioning race condition prevention';

-- Create atomic lock acquisition function for provisioning
-- This function atomically acquires a provisioning lock only if status is not already 'provisioning'
CREATE OR REPLACE FUNCTION acquire_provisioning_lock(p_business_id uuid, p_lock_id text)
RETURNS boolean AS $$
BEGIN
  UPDATE businesses
  SET provisioning_status = 'provisioning',
      provisioning_lock_id = p_lock_id,
      last_provisioning_attempt_at = now()
  WHERE id = p_business_id
    AND provisioning_status != 'provisioning';

  -- Return true if a row was updated (lock acquired), false otherwise
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Create ownership-aware lock release function
-- This function only releases the lock if the caller owns it (provisioning_lock_id matches)
CREATE OR REPLACE FUNCTION release_provisioning_lock(p_business_id uuid, p_lock_id text, p_status text, p_error text DEFAULT NULL)
RETURNS boolean AS $$
BEGIN
  UPDATE businesses
  SET provisioning_status = p_status,
      provisioning_lock_id = NULL,
      provisioning_error = p_error
  WHERE id = p_business_id
    AND provisioning_lock_id = p_lock_id;

  -- Return true if a row was updated (lock was owned and released), false otherwise
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION acquire_provisioning_lock TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION release_provisioning_lock TO authenticated, anon, service_role;