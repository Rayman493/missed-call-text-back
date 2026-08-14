-- Add attempt_id to payment_requests for durable payment attempt identity
-- This enables idempotency for Stripe Checkout, Venmo, and PayPal payment requests
-- Similar to terminal_attempt_id but for non-terminal payment methods

-- Add attempt_id column (nullable for historical records)
ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS attempt_id TEXT NULL;

-- Add unique constraint on business_id + attempt_id
-- This prevents duplicate payment requests for the same logical attempt
ALTER TABLE payment_requests
ADD CONSTRAINT payment_requests_attempt_id_unique
UNIQUE (business_id, attempt_id);

-- Add index for efficient lookups by attempt_id
CREATE INDEX IF NOT EXISTS idx_payment_requests_attempt_id
ON payment_requests(attempt_id)
WHERE attempt_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN payment_requests.attempt_id IS 'Durable UUID representing one logical payment request attempt. Used for idempotency across HTTP retries. Same attempt ID can never create multiple Stripe Checkout Sessions.';