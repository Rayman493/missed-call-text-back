-- Add UNIQUE constraint on twilio_message_sid to prevent duplicate messages on webhook retries
-- Migration: 20260624000000_add_twilio_message_sid_unique_constraint.sql
-- Purpose: Prevent duplicate inbound/outbound SMS messages when Twilio webhooks retry

-- First, clean up any existing duplicates by keeping the earliest message
WITH duplicates AS (
  SELECT 
    twilio_message_sid,
    MIN(id) as keep_id,
    ARRAY_AGG(id ORDER BY created_at) as all_ids
  FROM messages
  WHERE twilio_message_sid IS NOT NULL
  GROUP BY twilio_message_sid
  HAVING COUNT(*) > 1
)
DELETE FROM messages
WHERE id IN (
  SELECT unnest(all_ids[2:array_length(all_ids, 1)])
  FROM duplicates
);

-- Now add the unique constraint
ALTER TABLE messages 
ADD CONSTRAINT messages_twilio_message_sid_unique 
UNIQUE (twilio_message_sid);

-- Add index for performance (if not already exists)
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_twilio_message_sid_unique 
ON messages (twilio_message_sid) 
WHERE twilio_message_sid IS NOT NULL;

-- Comment for documentation
COMMENT ON CONSTRAINT messages_twilio_message_sid_unique ON messages IS 'Prevents duplicate messages from Twilio webhook retries';
