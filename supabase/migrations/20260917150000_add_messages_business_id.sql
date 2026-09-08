-- Forward-only migration: add business_id to public.messages
-- Required because live production schema is missing this column, breaking manual
-- SMS/MMS idempotency (business_id filter) and any RLS policies that reference it.
-- Backfills from conversations (primary) and leads (fallback).

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS business_id uuid;

-- Backfill business_id from the owning conversation or lead.
UPDATE messages m
SET business_id = COALESCE(c.business_id, l.business_id)
FROM conversations c
LEFT JOIN leads l ON l.id = m.lead_id
WHERE c.id = m.conversation_id
  AND m.business_id IS NULL;

-- Add a FK once values are populated (nullable is allowed for any rows that could not be backfilled).
ALTER TABLE messages
DROP CONSTRAINT IF EXISTS messages_business_id_fkey;

ALTER TABLE messages
ADD CONSTRAINT messages_business_id_fkey
FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

-- Index used by manual idempotency lookups and would-be RLS policies.
CREATE INDEX IF NOT EXISTS idx_messages_business_id ON messages(business_id);

-- Recreate the per-tenant client_message_id uniqueness that depends on business_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_business_client_message_id
ON messages(business_id, client_message_id)
WHERE client_message_id IS NOT NULL;

-- Recreate Twilio SID dedup index in case it is also missing.
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_twilio_message_sid_unique
ON messages(twilio_message_sid)
WHERE twilio_message_sid IS NOT NULL;
