-- Create trial_history table to track all free trials across account deletions
-- This prevents abuse by tracking phone numbers, Stripe customers, and business emails

CREATE TABLE IF NOT EXISTS trial_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL, -- Reference to the business (even if deleted)
  business_phone_number text NOT NULL, -- Business phone number (primary identity)
  business_email text, -- Business email (for duplicate detection)
  business_domain text, -- Extracted from email (for duplicate detection)
  stripe_customer_id text, -- Stripe customer ID (for Stripe-based protection)
  stripe_subscription_id text, -- Stripe subscription ID
  trial_started_at timestamptz NOT NULL DEFAULT now(),
  trial_ended_at timestamptz,
  trial_status text NOT NULL DEFAULT 'active', -- 'active', 'completed', 'canceled', 'converted'
  subscription_status text, -- Final subscription status
  user_id uuid, -- User who started the trial
  account_deleted_at timestamptz, -- When the account was deleted
  account_deleted_by text, -- 'self' or 'admin'
  deletion_reason text, -- Reason for account deletion
  metadata jsonb DEFAULT '{}'::jsonb, -- Additional metadata for abuse detection
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add indexes for efficient abuse prevention queries
CREATE INDEX IF NOT EXISTS idx_trial_history_business_phone_number ON trial_history(business_phone_number);
CREATE INDEX IF NOT EXISTS idx_trial_history_business_email ON trial_history(business_email) WHERE business_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trial_history_business_domain ON trial_history(business_domain) WHERE business_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trial_history_stripe_customer_id ON trial_history(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trial_history_user_id ON trial_history(user_id);
CREATE INDEX IF NOT EXISTS idx_trial_history_trial_status ON trial_history(trial_status);
CREATE INDEX IF NOT EXISTS idx_trial_history_account_deleted_at ON trial_history(account_deleted_at) WHERE account_deleted_at IS NOT NULL;

-- Add unique constraint to prevent duplicate trial history entries for the same business
-- This ensures we track each business only once
CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_history_business_unique ON trial_history(business_id);

-- Add comments for documentation
COMMENT ON TABLE trial_history IS 'Tracks all free trials across account deletions for abuse prevention';
COMMENT ON COLUMN trial_history.business_id IS 'Reference to the business (preserved even after deletion)';
COMMENT ON COLUMN trial_history.business_phone_number IS 'Primary business identity - used for one-trial-per-phone enforcement';
COMMENT ON COLUMN trial_history.business_email IS 'Business email for duplicate detection';
COMMENT ON COLUMN trial_history.business_domain IS 'Extracted domain for duplicate detection';
COMMENT ON COLUMN trial_history.stripe_customer_id IS 'Stripe customer ID for Stripe-based protection';
COMMENT ON COLUMN trial_history.stripe_subscription_id IS 'Stripe subscription ID';
COMMENT ON COLUMN trial_history.trial_status IS 'Trial status: active, completed, canceled, converted';
COMMENT ON COLUMN trial_history.account_deleted_at IS 'When the account was deleted (NULL if still active)';
COMMENT ON COLUMN trial_history.account_deleted_by IS 'Who deleted the account: self or admin';
COMMENT ON COLUMN trial_history.deletion_reason IS 'Reason for account deletion';
COMMENT ON COLUMN trial_history.metadata IS 'Additional metadata for abuse detection (IP, user agent, etc.)';

-- Enable RLS
ALTER TABLE trial_history ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can read/write trial_history
CREATE POLICY "Admins can manage trial_history" ON trial_history
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.email LIKE '%@replyflowhq.com' -- Admin email pattern
    )
  );

-- Policy: Service role can read/write trial_history (for backend APIs)
CREATE POLICY "Service role can manage trial_history" ON trial_history
  FOR ALL
  TO service_role
  USING (true);
