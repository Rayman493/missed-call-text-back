-- Add SMS delivery status tracking columns to messages table
-- Migration: 002_add_messages_status_tracking.sql

-- Add status column for tracking Twilio message status (queued, sent, delivered, failed, undelivered)
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent';

-- Add error_code column for Twilio error codes
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS error_code TEXT;

-- Add error_message column for detailed error information
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add status_updated_at timestamp to track when status was last updated
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

-- Add twilio_message_sid column to store Twilio message SID for status callbacks
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS twilio_message_sid TEXT;

-- Add sent_at timestamp for when message was sent
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Add delivered_at timestamp for when message was successfully delivered
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- Add comments for documentation
COMMENT ON COLUMN messages.status IS 'Twilio message status: queued, sent, delivered, failed, undelivered';
COMMENT ON COLUMN messages.error_code IS 'Twilio error code if message failed';
COMMENT ON COLUMN messages.error_message IS 'Detailed error message from Twilio if message failed';
COMMENT ON COLUMN messages.status_updated_at IS 'Timestamp when message status was last updated';
COMMENT ON COLUMN messages.twilio_message_sid IS 'Twilio message SID for status callback matching';
COMMENT ON COLUMN messages.sent_at IS 'Timestamp when message was sent to Twilio';
COMMENT ON COLUMN messages.delivered_at IS 'Timestamp when message was successfully delivered';

-- Create index on twilio_message_sid for faster status callback lookups
CREATE INDEX IF NOT EXISTS idx_messages_twilio_message_sid ON messages(twilio_message_sid);
