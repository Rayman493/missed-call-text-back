-- Add idempotency constraints to prevent duplicate automated messages
-- Migration: 20260529000001_add_message_idempotency_constraints.sql
-- Purpose: Prevent duplicate automated messages within time windows

-- Create a partial unique index to prevent duplicate automated messages
-- This index only applies to automated messages (with lead_id) within a 5-minute window
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_automated_unique 
ON messages (
  lead_id, 
  body, 
  direction
) 
WHERE (
  lead_id IS NOT NULL 
  AND direction = 'outbound'
  AND created_at >= (now() - interval '5 minutes')
);

-- Create a function to handle the 5-minute window constraint
CREATE OR REPLACE FUNCTION check_automated_message_duplicate()
RETURNS TRIGGER AS $$
BEGIN
  -- Check for duplicate automated messages within 5 minutes
  IF NEW.lead_id IS NOT NULL AND NEW.direction = 'outbound' THEN
    -- Check if similar message exists in the last 5 minutes
    IF EXISTS (
      SELECT 1 FROM messages 
      WHERE lead_id = NEW.lead_id 
        AND body = NEW.body 
        AND direction = NEW.direction 
        AND created_at >= (NEW.created_at - interval '5 minutes')
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'Duplicate automated message detected within 5-minute window';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for the duplicate check
CREATE TRIGGER check_message_duplicate_trigger
BEFORE INSERT OR UPDATE ON messages
FOR EACH ROW
EXECUTE FUNCTION check_automated_message_duplicate();

-- Add indexes for better performance on duplicate checks
CREATE INDEX IF NOT EXISTS idx_messages_lead_body_direction_created 
ON messages (lead_id, body, direction, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_type_sender 
ON messages (conversation_id, message_type, sender);

-- Comment for documentation
COMMENT ON INDEX idx_messages_automated_unique IS 'Prevents duplicate automated messages within 5-minute window';
COMMENT ON FUNCTION check_automated_message_duplicate() IS 'Checks for duplicate automated messages before insertion';
COMMENT ON TRIGGER check_message_duplicate_trigger IS 'Triggers duplicate check for automated messages';
