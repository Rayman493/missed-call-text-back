-- Create trial_overrides table for admin manual override capability
-- This allows admins to approve trials for legitimate businesses that trigger abuse prevention

CREATE TABLE IF NOT EXISTS trial_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_phone_number text NOT NULL, -- Phone number to allow trial for
  business_email text, -- Optional: business email
  override_reason text NOT NULL, -- Reason for override: 'support_case', 'onboarding_mistake', 'test_account', 'false_positive', etc.
  override_status text NOT NULL DEFAULT 'active', -- 'active', 'revoked'
  max_allowed_trials int DEFAULT 2, -- How many trials this phone/email is allowed
  trials_used int DEFAULT 0, -- How many trials have been used
  notes text, -- Admin notes
  created_by uuid NOT NULL, -- Admin user ID who created the override
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz, -- Optional expiration date
  metadata jsonb DEFAULT '{}'::jsonb -- Additional metadata
);

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_trial_overrides_business_phone_number ON trial_overrides(business_phone_number) WHERE override_status = 'active';
CREATE INDEX IF NOT EXISTS idx_trial_overrides_business_email ON trial_overrides(business_email) WHERE business_email IS NOT NULL AND override_status = 'active';
CREATE INDEX IF NOT EXISTS idx_trial_overrides_override_status ON trial_overrides(override_status);
CREATE INDEX IF NOT EXISTS idx_trial_overrides_created_by ON trial_overrides(created_by);

-- Add unique constraint to prevent duplicate active overrides for the same phone number
CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_overrides_phone_unique ON trial_overrides(business_phone_number) WHERE override_status = 'active';

-- Add comments for documentation
COMMENT ON TABLE trial_overrides IS 'Admin manual overrides for trial eligibility';
COMMENT ON COLUMN trial_overrides.business_phone_number IS 'Phone number to allow trial for';
COMMENT ON COLUMN trial_overrides.override_reason IS 'Reason for override: support_case, onboarding_mistake, test_account, false_positive, etc.';
COMMENT ON COLUMN trial_overrides.override_status IS 'Override status: active, revoked';
COMMENT ON COLUMN trial_overrides.max_allowed_trials IS 'How many trials this phone/email is allowed';
COMMENT ON COLUMN trial_overrides.trials_used IS 'How many trials have been used';
COMMENT ON COLUMN trial_overrides.created_by IS 'Admin user ID who created the override';
COMMENT ON COLUMN trial_overrides.expires_at IS 'Optional expiration date for the override';

-- Enable RLS
ALTER TABLE trial_overrides ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can read/write trial_overrides
CREATE POLICY "Admins can manage trial_overrides" ON trial_overrides
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.email LIKE '%@replyflowhq.com' -- Admin email pattern
    )
  );

-- Policy: Service role can read/write trial_overrides (for backend APIs)
CREATE POLICY "Service role can manage trial_overrides" ON trial_overrides
  FOR ALL
  TO service_role
  USING (true);
