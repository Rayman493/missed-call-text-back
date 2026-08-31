-- Add claim column for offboarding reminder idempotency
-- Migration: 20260831000000_add_offboarding_claim_column.sql
-- Purpose: Prevent duplicate email delivery in concurrent scheduler executions

-- Add processing_at column to track when a reminder is being processed
ALTER TABLE offboarding_tracking
ADD COLUMN IF NOT EXISTS processing_at TIMESTAMP WITH TIME ZONE;

-- Add index for efficient claim queries
CREATE INDEX IF NOT EXISTS idx_offboarding_tracking_processing_at ON offboarding_tracking(processing_at);

-- Add comment for documentation
COMMENT ON COLUMN offboarding_tracking.processing_at IS 'Timestamp when a reminder is currently being processed (claim). Used for idempotency to prevent duplicate email delivery in concurrent scheduler executions. Null means not currently being processed.';