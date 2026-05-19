-- Add missing fields to follow_up_jobs table
-- CRITICAL: These fields are required for proper follow-up job management
-- Migration: add_follow_up_jobs_missing_fields.sql

-- Add conversation_id for linking to conversations
ALTER TABLE follow_up_jobs
ADD COLUMN IF NOT EXISTS conversation_id uuid references conversations(id) on delete set null;

-- Add sent_at timestamp for tracking when follow-up was sent
ALTER TABLE follow_up_jobs
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Add idempotency_key for duplicate prevention
ALTER TABLE follow_up_jobs
ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Add step field for multi-step follow-up sequences
ALTER TABLE follow_up_jobs
ADD COLUMN IF NOT EXISTS step integer;

-- Add unique constraint on idempotency_key to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_follow_up_jobs_idempotency_key ON follow_up_jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Add index on conversation_id for performance
CREATE INDEX IF NOT EXISTS idx_follow_up_jobs_conversation_id ON follow_up_jobs(conversation_id);

-- Add comments for documentation
COMMENT ON COLUMN follow_up_jobs.conversation_id IS 'Optional reference to the conversation this follow-up belongs to';
COMMENT ON COLUMN follow_up_jobs.sent_at IS 'Timestamp when the follow-up message was successfully sent';
COMMENT ON COLUMN follow_up_jobs.idempotency_key IS 'Unique key to prevent duplicate follow-up jobs (format: leadId-step)';
COMMENT ON COLUMN follow_up_jobs.step IS 'Step number in the follow-up sequence (1, 2, 3, etc.)';
