-- Add conversation_id column to follow_up_jobs table
-- This column is needed to properly link follow-up jobs to conversations

ALTER TABLE follow_up_jobs 
ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_follow_up_jobs_conversation_id ON follow_up_jobs(conversation_id);

-- Add comment for documentation
COMMENT ON COLUMN follow_up_jobs.conversation_id IS 'Links follow-up job to the conversation thread';
