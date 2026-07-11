-- Add forwarding_instructions_confirmed_at to businesses table
-- This tracks when user confirms they've completed carrier forwarding setup
-- Separate from forwarding_verified which tracks actual technical verification via test call
-- Migration: 20260711000000_add_forwarding_instructions_confirmed_at.sql

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS forwarding_instructions_confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN businesses.forwarding_instructions_confirmed_at IS 'Timestamp when user confirmed they completed carrier forwarding instructions (separate from actual forwarding_verified which requires test call)';
