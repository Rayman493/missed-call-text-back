-- Add step and idempotency_key columns to follow_up_jobs table
-- step column tracks which follow-up step in the sequence (1, 2, etc.)
-- idempotency_key column prevents duplicate follow-up jobs

ALTER TABLE follow_up_jobs 
ADD COLUMN IF NOT EXISTS step INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS idempotency_key TEXT NOT NULL DEFAULT '';

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_follow_up_jobs_step ON follow_up_jobs(step);
CREATE UNIQUE INDEX IF NOT EXISTS idx_follow_up_jobs_idempotency_key ON follow_up_jobs(idempotency_key);

-- Add comments for documentation
COMMENT ON COLUMN follow_up_jobs.step IS 'The step number in the follow-up sequence (1 = first follow-up, 2 = second, etc.)';
COMMENT ON COLUMN follow_up_jobs.idempotency_key IS 'Unique key to prevent duplicate follow-up jobs (format: leadId-step)';
