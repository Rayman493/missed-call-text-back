-- PRODUCTION FIX: Add missing columns for notifications
-- Run this script directly in production Supabase SQL Editor
-- This script adds columns that are expected by the notification service but missing from production schema

-- Add data column to notifications table
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data jsonb DEFAULT '{}'::jsonb;

-- Add read column to notifications table
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read boolean DEFAULT false;

-- Add action_url column to notifications table
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url text;

-- Add action_text column to notifications table
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_text text;

-- Add read_at column to notifications table (optional, for tracking when notification was read)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Add lead_id column to notifications table (optional, for linking to specific lead)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES leads(id) ON DELETE CASCADE;

-- Add message_id column to notifications table (optional, for linking to specific message)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES messages(id) ON DELETE CASCADE;

-- Add comments for documentation
COMMENT ON COLUMN notifications.data IS 'JSON data for notification, includes leadId, messageId, and other contextual information';
COMMENT ON COLUMN notifications.read IS 'Whether notification has been read by user';
COMMENT ON COLUMN notifications.read_at IS 'Timestamp when notification was marked as read';
COMMENT ON COLUMN notifications.action_url IS 'URL to navigate when notification is clicked';
COMMENT ON COLUMN notifications.action_text IS 'Text for action button';
COMMENT ON COLUMN notifications.lead_id IS 'Reference to lead associated with notification';
COMMENT ON COLUMN notifications.message_id IS 'Reference to message associated with notification';

-- Verification query
SELECT column_name, 
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = column_name) as exists
FROM (VALUES 
  ('data'),
  ('read'),
  ('read_at'),
  ('action_url'),
  ('action_text'),
  ('lead_id'),
  ('message_id')
) AS t(column_name);
