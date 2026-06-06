-- Add image message support to messages table
-- Migration: 20260605000000_add_image_message_support.sql
-- Purpose: Enable storing and displaying image messages from MMS

-- Add 'image' and 'mixed' to message_type check constraint
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check 
  CHECK (message_type IN ('text', 'note', 'summary', 'transcript', 'image', 'mixed'));

-- Add media_count column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_count INTEGER DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN messages.message_type IS 'Message type: text, note, summary, transcript, image, or mixed (text + image)';
COMMENT ON COLUMN messages.media_count IS 'Number of media attachments in this message (0 for text-only messages)';
