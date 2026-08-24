-- Fix automated SMS deduplication to respect call-specific idempotency
-- Migration: 20260824000001_fix_automated_sms_call_sid_deduplication.sql
-- Purpose: Update duplicate prevention trigger to allow different calls on same lead within 5 minutes
-- 
-- Problem: The existing trigger blocks automated SMS for different calls (different call_sid)
-- on the same lead within 5 minutes if the body is similar. This prevents legitimate
-- follow-up calls from having their SMS persisted.
--
-- Solution: Check structured_data->>'call_sid' to distinguish messages from different calls.
-- Only block if call_sid matches (true duplicate). Allow if call_sid differs (legitimate new call).

-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS check_message_duplicate_trigger ON messages;
DROP FUNCTION IF EXISTS check_automated_message_duplicate();

-- Recreate the function with call_sid check
CREATE OR REPLACE FUNCTION check_automated_message_duplicate()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check for duplicate automated messages (is_manual = false or NULL)
  IF NEW.lead_id IS NOT NULL 
     AND NEW.direction = 'outbound'
     AND COALESCE(NEW.is_manual, false) = false THEN
    
    -- Get the call_sid from structured_data if present
    DECLARE new_call_sid TEXT;
    
    BEGIN
      new_call_sid := NEW.structured_data->>'call_sid';
    EXCEPTION WHEN OTHERS THEN
      new_call_sid := NULL;
    END;
    
    -- Check if similar message exists in the last 5 minutes with SAME call_sid
    IF EXISTS (
      SELECT 1 FROM messages m
      WHERE m.lead_id = NEW.lead_id
        AND m.business_id = NEW.business_id
        AND m.body = NEW.body
        AND m.direction = NEW.direction
        AND COALESCE(m.is_manual, false) = false
        AND m.created_at >= (NEW.created_at - interval '5 minutes')
        AND m.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
        -- Only block if call_sid matches (true duplicate)
        AND CASE 
          -- Both messages lack call_sid: use legacy behavior (block to protect against duplicates)
          WHEN new_call_sid IS NULL AND m.structured_data->>'call_sid' IS NULL THEN true
          -- New message has call_sid but old message doesn't: assume legitimate new call (allow)
          WHEN new_call_sid IS NOT NULL AND m.structured_data->>'call_sid' IS NULL THEN false
          -- Both have call_sid and match: true duplicate (block)
          WHEN new_call_sid IS NOT NULL AND m.structured_data->>'call_sid' = new_call_sid THEN true
          -- Both have call_sid but differ: legitimate different calls (allow)
          ELSE false
        END
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
COMMENT ON FUNCTION check_automated_message_duplicate() IS 'Checks for duplicate automated messages before insertion, respecting call-specific idempotency via structured_data.call_sid';
COMMENT ON TRIGGER check_message_duplicate_trigger IS 'Triggers duplicate check for automated messages only (is_manual = false), allowing different calls on same lead';