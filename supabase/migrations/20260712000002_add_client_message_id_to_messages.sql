-- Add client_message_id for durable optimistic message correlation
-- This field allows the frontend to correlate optimistic messages with persisted messages
-- across API responses and Supabase Realtime events

-- Add the nullable UUID field
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS client_message_id UUID;

-- Add index for efficient reconciliation lookups
CREATE INDEX IF NOT EXISTS idx_messages_client_message_id 
ON messages(client_message_id) 
WHERE client_message_id IS NOT NULL;

-- Add unique constraint scoped to business_id to prevent duplicates within a tenant
-- This ensures that the same client_message_id cannot be used twice for the same business
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_business_client_message_id 
ON messages(business_id, client_message_id) 
WHERE client_message_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN messages.client_message_id IS 'Client-generated UUID for optimistic message correlation. Used to match optimistic UI messages with persisted database messages across API responses and realtime events. Nullable for inbound messages, automatic messages, and legacy records.';
