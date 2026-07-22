-- Make payment_requests.token nullable for Terminal/card_present payments
-- Migration: 20260722000003_make_payment_requests_token_nullable_for_terminal.sql
-- Purpose: Allow token to be null for Terminal payments which don't use payment links

-- Token is required for online payment-link requests (ReplyFlow URL /pay/[token])
-- Token may be null for card_present / Terminal payments (in-person NFC)

-- Drop NOT NULL constraint on token
ALTER TABLE payment_requests
ALTER COLUMN token DROP NOT NULL;

-- Ensure unique index only applies to non-null tokens (idempotent)
-- PostgreSQL treats NULL values as distinct, so multiple NULL tokens are allowed
DROP INDEX IF EXISTS payment_requests_token_unique;
CREATE UNIQUE INDEX IF NOT EXISTS payment_requests_token_unique
ON payment_requests(token)
WHERE token IS NOT NULL;

-- Add comment documenting the semantics
COMMENT ON COLUMN payment_requests.token IS 'Secure random token for branded payment links (ReplyFlow URL). Required for online payment requests, nullable for Terminal/card_present payments.';
