-- Add forwarding_disabled_at column for offboarding flow
-- Tracks when a customer confirms they've disabled call forwarding

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS forwarding_disabled_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN businesses.forwarding_disabled_at IS 'Timestamp when customer confirmed they disabled call forwarding during offboarding';
