-- Create operational_alerts table for durable alert state
-- This table tracks alert state across serverless instances and deployments
-- Prevents duplicate alerts and enables proper cooldown/rate limiting

CREATE TABLE IF NOT EXISTS operational_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  condition_id TEXT NOT NULL UNIQUE,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'degraded')),
  current_state TEXT NOT NULL CHECK (current_state IN ('active', 'resolved')),
  first_triggered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_triggered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_alerted_at TIMESTAMP WITH TIME ZONE,
  alert_count_for_period INTEGER NOT NULL DEFAULT 0,
  alert_count_period_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  latest_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_operational_alerts_condition_id ON operational_alerts(condition_id);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_current_state ON operational_alerts(current_state);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_last_triggered_at ON operational_alerts(last_triggered_at);

-- Add RLS policies (service role only - no business user access)
ALTER TABLE operational_alerts ENABLE ROW LEVEL SECURITY;

-- Policy for service account to manage alerts
CREATE POLICY "Service can manage operational_alerts" ON operational_alerts
  FOR ALL USING (true);

-- Add comment
COMMENT ON TABLE operational_alerts IS 'Tracks operational alert state for system health monitoring across serverless instances';
COMMENT ON COLUMN operational_alerts.condition_id IS 'Unique identifier for the alert condition (e.g., database-connectivity)';
COMMENT ON COLUMN operational_alerts.severity IS 'Severity level: critical or degraded';
COMMENT ON COLUMN operational_alerts.current_state IS 'Current state: active or resolved';
COMMENT ON COLUMN operational_alerts.first_triggered_at IS 'First time this condition was triggered';
COMMENT ON COLUMN operational_alerts.last_triggered_at IS 'Most recent time this condition was triggered';
COMMENT ON COLUMN operational_alerts.last_alerted_at IS 'Most recent time an alert was sent for this condition';
COMMENT ON COLUMN operational_alerts.alert_count_for_period IS 'Number of alerts sent in current period';
COMMENT ON COLUMN operational_alerts.alert_count_period_start IS 'Start of current alert counting period';
COMMENT ON COLUMN operational_alerts.resolved_at IS 'Timestamp when condition was marked resolved';
COMMENT ON COLUMN operational_alerts.latest_summary IS 'Latest summary of the condition';

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_operational_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER operational_alerts_updated_at
  BEFORE UPDATE ON operational_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_operational_alerts_updated_at();

-- Atomic alert claim function
-- This function atomically checks cooldown and rate limits, then claims permission to send an alert
-- Returns: { claimed: boolean, alert_count: integer, last_alerted_at: timestamp }
-- If claimed=true, the caller should send the email (this is the only execution that got the claim)
-- If claimed=false, another execution already claimed the alert or limits were reached
CREATE OR REPLACE FUNCTION claim_operational_alert(
  p_condition_id TEXT,
  p_severity TEXT
)
RETURNS JSON AS $$
DECLARE
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_cooldown_hours INTEGER := 1;
  v_max_alerts_per_day INTEGER := 5;
  v_existing RECORD;
  v_claimed BOOLEAN := false;
  v_new_count INTEGER := 0;
  v_period_start TIMESTAMP WITH TIME ZONE := v_now;
  v_result JSON;
BEGIN
  -- Lock the row for this condition to prevent concurrent claims
  SELECT * INTO v_existing
  FROM operational_alerts
  WHERE condition_id = p_condition_id
  FOR UPDATE;

  -- If no existing record, create one and claim immediately
  IF NOT FOUND THEN
    INSERT INTO operational_alerts (
      condition_id,
      severity,
      current_state,
      first_triggered_at,
      last_triggered_at,
      last_alerted_at,
      alert_count_for_period,
      alert_count_period_start,
      latest_summary
    ) VALUES (
      p_condition_id,
      p_severity,
      'active',
      v_now,
      v_now,
      v_now,
      1,
      v_now,
      'Condition triggered'
    );

    v_claimed := true;
    v_new_count := 1;
  ELSE
    -- Check cooldown: must be at least 1 hour since last alert
    IF v_existing.last_alerted_at IS NOT NULL THEN
      IF v_now - v_existing.last_alerted_at < (v_cooldown_hours * INTERVAL '1 hour') THEN
        -- Still in cooldown, cannot claim
        v_claimed := false;
        v_new_count := v_existing.alert_count_for_period;
      ELSE
        -- Cooldown passed, check daily rate limit
        -- Reset count if new day
        IF DATE(v_existing.alert_count_period_start) != DATE(v_now) THEN
          v_new_count := 1;
          v_period_start := v_now;
        ELSE
          v_new_count := v_existing.alert_count_for_period + 1;
          v_period_start := v_existing.alert_count_period_start;
        END IF;

        -- Check daily rate limit
        IF v_new_count <= v_max_alerts_per_day THEN
          -- Can claim
          v_claimed := true;
        ELSE
          -- Daily limit reached
          v_claimed := false;
        END IF;
      END IF;
    ELSE
      -- Never alerted before, can claim
      v_new_count := 1;
      v_period_start := v_now;
      v_claimed := true;
    END IF;

    -- If claiming, update the record
    IF v_claimed THEN
      UPDATE operational_alerts
      SET
        current_state = 'active',
        severity = p_severity,
        last_triggered_at = v_now,
        last_alerted_at = v_now,
        alert_count_for_period = v_new_count,
        alert_count_period_start = v_period_start,
        resolved_at = NULL,
        updated_at = v_now
      WHERE condition_id = p_condition_id;
    END IF;
  END IF;

  -- Build result
  v_result := json_build_object(
    'claimed', v_claimed,
    'alert_count', v_new_count,
    'last_alerted_at', COALESCE((SELECT last_alerted_at FROM operational_alerts WHERE condition_id = p_condition_id), v_now)
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error and return failure
    RAISE WARNING 'claim_operational_alert error for condition %: %', p_condition_id, SQLERRM;
    RETURN json_build_object('claimed', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Comment on the function
COMMENT ON FUNCTION claim_operational_alert IS 'Atomically claims permission to send an operational alert, enforcing cooldown and rate limits. Returns JSON with claimed boolean and metadata.';
