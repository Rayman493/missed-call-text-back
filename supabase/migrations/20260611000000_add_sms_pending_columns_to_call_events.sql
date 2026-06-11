-- Add SMS tracking fields to call_events table
-- This enables delayed SMS sending after voicemail completion
-- Migration created to fix production schema mismatch

ALTER TABLE call_events 
ADD COLUMN IF NOT EXISTS sms_pending BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sms_scheduled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS sms_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS sms_message_sid VARCHAR(255);

-- Add index for efficient querying of pending SMS
CREATE INDEX IF NOT EXISTS idx_call_events_sms_pending ON call_events(sms_pending, twilio_call_sid);

-- Add comment for documentation
COMMENT ON COLUMN call_events.sms_pending IS 'Tracks whether SMS is pending for this call event';
COMMENT ON COLUMN call_events.sms_scheduled_at IS 'When SMS was scheduled for sending';
COMMENT ON COLUMN call_events.sms_sent_at IS 'When SMS was actually sent';
COMMENT ON COLUMN call_events.sms_message_sid IS 'Twilio message SID for the sent SMS';
