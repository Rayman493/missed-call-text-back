-- Enable Supabase Realtime for messages table
-- Migration: 20260712000001_enable_realtime_for_messages.sql
-- Purpose: Add messages table to supabase_realtime publication for realtime updates

-- Add messages table to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Set replica identity to FULL for messages to ensure UPDATE events include all columns
-- This is required for realtime UPDATE events to work properly
ALTER TABLE messages REPLICA IDENTITY FULL;

-- Add leads table to supabase_realtime publication for lead updates
ALTER PUBLICATION supabase_realtime ADD TABLE leads;

-- Set replica identity to FULL for leads
ALTER TABLE leads REPLICA IDENTITY FULL;

-- Add conversations table to supabase_realtime publication for conversation updates
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

-- Set replica identity to FULL for conversations
ALTER TABLE conversations REPLICA IDENTITY FULL;

-- Add payment_requests table to supabase_realtime publication for payment request updates
ALTER PUBLICATION supabase_realtime ADD TABLE payment_requests;

-- Set replica identity to FULL for payment_requests
ALTER TABLE payment_requests REPLICA IDENTITY FULL;

-- Add jobs table to supabase_realtime publication for job updates
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;

-- Set replica identity to FULL for jobs
ALTER TABLE jobs REPLICA IDENTITY FULL;

-- Comments for documentation
COMMENT ON PUBLICATION supabase_realtime IS 'Realtime publication for tables that need live updates in the UI';
