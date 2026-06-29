-- Ensure payment_requests.token column exists (production fix)
-- Migration: 20260629000001_ensure_payment_token.sql
-- Purpose: Add token column if missing from production schema

-- Add token column with unique constraint (idempotent)
ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS token TEXT;

-- Add unique index for fast token lookups (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS payment_requests_token_unique 
ON payment_requests(token) 
WHERE token IS NOT NULL;

-- Generate tokens for existing payment requests (idempotent)
UPDATE payment_requests
SET token = encode(gen_random_bytes(16), 'hex')
WHERE token IS NULL;

-- Set NOT NULL constraint after backfilling (idempotent)
ALTER TABLE payment_requests
ALTER COLUMN token SET NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN payment_requests.token IS 'Secure random token for branded payment links (ReplyFlow URL)';
