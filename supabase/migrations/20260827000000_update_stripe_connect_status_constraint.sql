-- Update Stripe Connect status constraint to use canonical values
-- Migration: 20260827000000_update_stripe_connect_status_constraint.sql
-- Purpose: Replace legacy status values with canonical Connect lifecycle states

-- Step 1: Drop old constraint
ALTER TABLE businesses
DROP CONSTRAINT IF EXISTS businesses_stripe_connect_status_check;

-- Step 2: Backfill legacy 'pending' values based on actual account state
-- Legacy 'pending' meant onboarding in progress, but we need to distinguish:
-- - setup_incomplete: user still needs to submit requirements
-- - pending_verification: user submitted, Stripe is reviewing
UPDATE businesses
SET stripe_connect_status =
  CASE
    -- If charges enabled, it's connected regardless of old status
    WHEN stripe_charges_enabled = true AND stripe_details_submitted = true THEN 'connected'
    -- If no account ID, it's not connected
    WHEN stripe_connect_account_id IS NULL THEN 'not_connected'
    -- If details not submitted, it's setup incomplete
    WHEN stripe_details_submitted = false THEN 'setup_incomplete'
    -- Otherwise details submitted but charges not enabled - pending verification
    ELSE 'pending_verification'
  END
WHERE stripe_connect_status = 'pending';

-- Step 3: Backfill legacy 'restricted' values
-- 'restricted' was a legacy value - map based on current state
UPDATE businesses
SET stripe_connect_status =
  CASE
    WHEN stripe_charges_enabled = true AND stripe_details_submitted = true THEN 'connected'
    WHEN stripe_connect_account_id IS NULL THEN 'not_connected'
    WHEN stripe_details_submitted = false THEN 'setup_incomplete'
    ELSE 'pending_verification'
  END
WHERE stripe_connect_status = 'restricted';

-- Step 4: Backfill null values for businesses with Connect accounts
-- New businesses have null - normalize to not_connected if no account, or derive from actual state
UPDATE businesses
SET stripe_connect_status =
  CASE
    WHEN stripe_connect_account_id IS NULL THEN 'not_connected'
    WHEN stripe_charges_enabled = true AND stripe_details_submitted = true THEN 'connected'
    WHEN stripe_details_submitted = false THEN 'setup_incomplete'
    ELSE 'pending_verification'
  END
WHERE stripe_connect_status IS NULL;

-- Step 5: Add new constraint with canonical values
ALTER TABLE businesses
ADD CONSTRAINT businesses_stripe_connect_status_check
CHECK (stripe_connect_status IN ('not_connected', 'setup_incomplete', 'pending_verification', 'connected'));

-- Step 6: Update comment
COMMENT ON COLUMN businesses.stripe_connect_status IS 'Canonical Stripe Connect status: not_connected, setup_incomplete, pending_verification, connected';