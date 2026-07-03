-- Add checkout_completed_at column to businesses table
-- This column marks when Stripe Checkout was successfully completed
-- It is used to gate subscription event activation to prevent premature activation when user cancels checkout

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS checkout_completed_at timestamptz;

-- Add comment for documentation
COMMENT ON COLUMN businesses.checkout_completed_at IS 'Timestamp when Stripe Checkout was successfully completed. Used to gate subscription event activation to prevent premature activation when user cancels checkout.';

-- Verification query
SELECT column_name,
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'businesses' AND column_name = 'checkout_completed_at') as exists
FROM (VALUES ('checkout_completed_at')) AS t(column_name);
