-- Repair: add missing Batch-2 billing_documents columns that production never received.
-- The Batch-2 migration (20260913220000_add_billing_snapshots_tokens_logo.sql) was
-- not applied to production. This migration adds ONLY the missing columns using
-- ADD COLUMN IF NOT EXISTS so it is safe to run even if some columns were later
-- added manually.
--
-- This migration does NOT:
--   - drop or recreate billing_documents
--   - truncate any data
--   - reset document numbers or counters
--   - touch storage buckets or policies
--   - modify the assign_billing_document_number RPC
--
-- All existing billing documents and counters are preserved.

-- ---------------------------------------------------------------------------
-- billing_documents: public token, conversion tracking, payment timestamp
-- ---------------------------------------------------------------------------
ALTER TABLE billing_documents
    ADD COLUMN IF NOT EXISTS public_token text UNIQUE;

ALTER TABLE billing_documents
    ADD COLUMN IF NOT EXISTS source_quote_id uuid REFERENCES billing_documents(id) ON DELETE SET NULL;

ALTER TABLE billing_documents
    ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- ---------------------------------------------------------------------------
-- billing_documents: business snapshot (frozen at send time)
-- ---------------------------------------------------------------------------
ALTER TABLE billing_documents
    ADD COLUMN IF NOT EXISTS snapshot_business_name text,
    ADD COLUMN IF NOT EXISTS snapshot_business_phone text,
    ADD COLUMN IF NOT EXISTS snapshot_business_email text,
    ADD COLUMN IF NOT EXISTS snapshot_business_address text,
    ADD COLUMN IF NOT EXISTS snapshot_business_logo_url text;

-- ---------------------------------------------------------------------------
-- billing_documents: customer snapshot (frozen at send time)
-- ---------------------------------------------------------------------------
ALTER TABLE billing_documents
    ADD COLUMN IF NOT EXISTS snapshot_customer_name text,
    ADD COLUMN IF NOT EXISTS snapshot_customer_phone text,
    ADD COLUMN IF NOT EXISTS snapshot_customer_email text,
    ADD COLUMN IF NOT EXISTS snapshot_customer_address text;

-- ---------------------------------------------------------------------------
-- Indexes for public token and conversion lookups
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_billing_documents_public_token
    ON billing_documents(public_token) WHERE public_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_documents_source_quote
    ON billing_documents(source_quote_id) WHERE source_quote_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Reload PostgREST schema cache so the new columns are exposed via the API
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
