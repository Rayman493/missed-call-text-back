-- Add SMS delivery status tracking columns to messages table
-- Migration: add_sms_delivery_status_tracking.sql

-- Add error tracking columns
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS error_code TEXT;

ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add delivery timestamp columns
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

-- Add comments for documentation
COMMENT ON COLUMN messages.error_code IS 'Twilio error code when message delivery fails';
COMMENT ON COLUMN messages.error_message IS 'Twilio error message when message delivery fails';
COMMENT ON COLUMN messages.delivered_at IS 'Timestamp when message was successfully delivered';
COMMENT ON COLUMN messages.sent_at IS 'Timestamp when message was sent to Twilio';
COMMENT ON COLUMN messages.failed_at IS 'Timestamp when message delivery failed';

-- Create index on twilio_message_sid for faster status callback lookups
CREATE INDEX IF NOT EXISTS idx_messages_twilio_message_sid ON messages(twilio_message_sid) WHERE twilio_message_sid IS NOT NULL;

-- Create index on status for filtering by delivery status
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
