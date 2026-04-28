-- Add unique constraint on call_events.twilio_call_sid to prevent duplicates
-- Migration: add_unique_call_sid_constraint.sql

-- Create unique index on twilio_call_sid (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_events_call_sid 
ON call_events(twilio_call_sid) 
WHERE twilio_call_sid IS NOT NULL;

-- Add comment for documentation
COMMENT ON INDEX idx_call_events_call_sid IS 'Prevents duplicate call events for the same Twilio CallSid';
