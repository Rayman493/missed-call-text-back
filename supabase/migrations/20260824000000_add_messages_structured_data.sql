-- Add missing structured_data column to messages table
-- This column was defined in the original leads/conversations migration but never applied to production
-- Required for call-specific SMS idempotency and duplicate detection
-- Migration: 20260824000000_add_messages_structured_data.sql

ALTER TABLE messages ADD COLUMN IF NOT EXISTS structured_data jsonb DEFAULT '{}'::jsonb;

-- Add index for structured_data queries used in SMS idempotency checks
CREATE INDEX IF NOT EXISTS idx_messages_structured_data ON messages USING GIN (structured_data);

-- Add comment for documentation
COMMENT ON COLUMN messages.structured_data IS 'Structured metadata for messages, including call_sid for call-specific idempotency and other message-specific attributes';

-- Verification query
SELECT 'messages.structured_data' as column_name, 
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'structured_data') as exists;