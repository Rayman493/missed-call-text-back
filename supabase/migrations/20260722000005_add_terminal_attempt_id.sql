-- Add terminal_attempt_id to payment_requests for durable payment attempt identity
-- This prevents duplicate charges by ensuring one logical payment attempt maps to exactly one PaymentIntent

-- Add terminal_attempt_id column (nullable for historical records)
ALTER TABLE payment_requests 
ADD COLUMN terminal_attempt_id TEXT NULL;

-- Add unique constraint on business_id + terminal_attempt_id
-- This ensures one terminal attempt ID can only exist once per business
ALTER TABLE payment_requests 
ADD CONSTRAINT unique_terminal_attempt_per_business 
UNIQUE (business_id, terminal_attempt_id);

-- Add index for efficient lookups by terminal_attempt_id
CREATE INDEX idx_payment_requests_terminal_attempt_id 
ON payment_requests(terminal_attempt_id) 
WHERE terminal_attempt_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN payment_requests.terminal_attempt_id IS 'Durable UUID representing one logical Tap to Pay payment attempt. Used for idempotency and preventing duplicate charges. Same attempt ID can never create multiple PaymentIntents.';
