-- Migration to remove unique constraint from businesses.twilio_phone_number
-- This allows multiple businesses to share the same ReplyFlow number for MVP

-- First, drop the unique constraint if it exists
-- The constraint name is typically "businesses_twilio_phone_number_key" in PostgreSQL
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_twilio_phone_number_key;

-- Note: We keep the NOT NULL constraint as businesses should always have a phone number
-- Business data isolation is maintained through business_id/user_id, not phone number uniqueness

-- Add a comment to document this change
COMMENT ON COLUMN businesses.twilio_phone_number IS 'Shared ReplyFlow number - not unique across businesses for MVP. Data isolation handled by business_id.';
