-- Add Venmo and PayPal payment fields to businesses table
-- This enables multi-provider payment requests (Stripe, Venmo, PayPal)

-- Add Venmo username field
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS venmo_username TEXT;

-- Add PayPal payment link field
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS paypal_payment_link TEXT;

-- Add payment provider preference field (optional, for future use)
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS preferred_payment_provider TEXT;

-- Add indexes for payment provider queries
CREATE INDEX IF NOT EXISTS idx_businesses_venmo_username ON businesses(venmo_username) WHERE venmo_username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_businesses_paypal_payment_link ON businesses(paypal_payment_link) WHERE paypal_payment_link IS NOT NULL;

-- Add comment to document the new fields
COMMENT ON COLUMN businesses.venmo_username IS 'Venmo username for payment requests (e.g., joesplumbing or @joesplumbing)';
COMMENT ON COLUMN businesses.paypal_payment_link IS 'PayPal payment link for payment requests (e.g., paypal.me/joesplumbing or full URL)';
COMMENT ON COLUMN businesses.preferred_payment_provider IS 'Preferred payment provider for requests: stripe, venmo, or paypal';
