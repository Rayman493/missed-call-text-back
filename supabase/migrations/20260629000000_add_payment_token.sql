-- Add secure token field to payment_requests table
-- Migration: 20260629000000_add_payment_token.sql
-- Purpose: Add a secure random token for branded payment links

-- Add token column with unique constraint
ALTER TABLE payment_requests
ADD COLUMN token TEXT UNIQUE;

-- Add index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_payment_requests_token ON payment_requests(token);

-- Generate tokens for existing payment requests
UPDATE payment_requests
SET token = encode(gen_random_bytes(16), 'hex')
WHERE token IS NULL;

-- Add NOT NULL constraint after backfilling
ALTER TABLE payment_requests
ALTER COLUMN token SET NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN payment_requests.token IS 'Secure random token for branded payment links (ReplyFlow URL)';
