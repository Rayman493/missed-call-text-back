-- PRODUCTION FIX: Add missing columns for inbound SMS/MMS processing
-- Run this script directly in production Supabase SQL Editor
-- This script adds all columns expected by the application code

-- Add raw_metadata column to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS raw_metadata jsonb DEFAULT '{}'::jsonb;

-- Add media_count column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_count integer DEFAULT 0;

-- Add caller_phone column to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS caller_phone text;

-- Note: caller_phone will be populated by new lead creation
-- Existing leads without caller_phone will have it null (acceptable)

-- Add last_reply_at column to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_reply_at timestamptz;

-- Add opted_out column to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS opted_out boolean DEFAULT false;

-- Add is_demo column to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;

-- Add twilio_message_sid column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS twilio_message_sid text;

-- Add status column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS status text DEFAULT 'sent';

-- Add message_type column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'text';

-- Add comments for documentation
COMMENT ON COLUMN leads.raw_metadata IS 'JSON metadata for lead, includes AI intake data, customer corrections, image metadata';
COMMENT ON COLUMN leads.caller_phone IS 'Normalized customer phone number (E.164 format)';
COMMENT ON COLUMN leads.last_reply_at IS 'Timestamp of last customer reply';
COMMENT ON COLUMN leads.opted_out IS 'Whether customer has opted out of SMS';
COMMENT ON COLUMN leads.is_demo IS 'Whether this is a demo/test lead';
COMMENT ON COLUMN messages.media_count IS 'Number of media attachments in message';
COMMENT ON COLUMN messages.twilio_message_sid IS 'Twilio message SID for tracking';
COMMENT ON COLUMN messages.status IS 'Message status (sent, delivered, failed, received)';
COMMENT ON COLUMN messages.message_type IS 'Message type (text, image, mixed, note, summary, transcript)';

-- Verification query
SELECT 'leads.raw_metadata' as column_name, 
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'raw_metadata') as exists
UNION ALL
SELECT 'messages.media_count' as column_name, 
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'media_count') as exists
UNION ALL
SELECT 'leads.caller_phone' as column_name, 
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'caller_phone') as exists
UNION ALL
SELECT 'leads.last_reply_at' as column_name, 
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'last_reply_at') as exists
UNION ALL
SELECT 'leads.opted_out' as column_name, 
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'opted_out') as exists
UNION ALL
SELECT 'leads.is_demo' as column_name, 
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'is_demo') as exists
UNION ALL
SELECT 'messages.twilio_message_sid' as column_name, 
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'twilio_message_sid') as exists
UNION ALL
SELECT 'messages.status' as column_name, 
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'status') as exists
UNION ALL
SELECT 'messages.message_type' as column_name, 
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'message_type') as exists;
