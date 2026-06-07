-- Fix duplicate trigger to allow manual messages
-- Migration: 20260608000000_fix_duplicate_trigger_to_check_is_manual.sql
-- Purpose: Update duplicate prevention trigger to allow manual messages

-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS check_message_duplicate_trigger ON messages;
DROP FUNCTION IF EXISTS check_automated_message_duplicate();

-- Recreate the function with is_manual check
CREATE OR REPLACE FUNCTION check_automated_message_duplicate()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check for duplicate automated messages (is_manual = false or NULL)
  IF NEW.lead_id IS NOT NULL 
     AND NEW.direction = 'outbound'
     AND COALESCE(NEW.is_manual, false) = false THEN
    
    -- Check if similar message exists in the last 5 minutes
    IF EXISTS (
      SELECT 1 FROM messages 
      WHERE lead_id = NEW.lead_id 
        AND body = NEW.body 
        AND direction = NEW.direction 
        AND COALESCE(is_manual, false) = false
        AND created_at >= (NEW.created_at - interval '5 minutes')
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'P0001', 'Duplicate automated message blocked (within 5 minute window)';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER check_message_duplicate_trigger
BEFORE INSERT OR UPDATE ON messages
FOR EACH ROW
EXECUTE FUNCTION check_automated_message_duplicate();

-- Update comment
COMMENT ON FUNCTION check_automated_message_duplicate() IS 'Checks for duplicate automated messages before insertion, excluding manual messages';
COMMENT ON TRIGGER check_message_duplicate_trigger IS 'Triggers duplicate check for automated messages only (is_manual = false)';
