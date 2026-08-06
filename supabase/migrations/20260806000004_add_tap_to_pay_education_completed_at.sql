-- Add tap_to_pay_education_completed_at column to businesses table
-- This tracks when a merchant completes the Tap to Pay on iPhone education flow
-- Separate from awareness acknowledgment and Stripe Connect status

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS tap_to_pay_education_completed_at TIMESTAMPTZ NULL;

-- Add comment for documentation
COMMENT ON COLUMN businesses.tap_to_pay_education_completed_at IS 'Timestamp when merchant completed Tap to Pay on iPhone education flow. Separate from awareness acknowledgment.';
