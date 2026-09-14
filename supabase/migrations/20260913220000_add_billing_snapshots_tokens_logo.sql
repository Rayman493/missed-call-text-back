-- Quote/Invoice Batch 2: snapshots, public tokens, logo, conversion tracking.
-- Extends billing_documents from 20260913210000_create_billing_documents.sql.

-- ---------------------------------------------------------------------------
-- billing_documents: snapshot + public token + conversion columns
-- ---------------------------------------------------------------------------
ALTER TABLE billing_documents
    ADD COLUMN IF NOT EXISTS public_token text UNIQUE,
    ADD COLUMN IF NOT EXISTS source_quote_id uuid REFERENCES billing_documents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Business snapshot (frozen at send time)
ALTER TABLE billing_documents
    ADD COLUMN IF NOT EXISTS snapshot_business_name text,
    ADD COLUMN IF NOT EXISTS snapshot_business_phone text,
    ADD COLUMN IF NOT EXISTS snapshot_business_email text,
    ADD COLUMN IF NOT EXISTS snapshot_business_address text,
    ADD COLUMN IF NOT EXISTS snapshot_business_logo_url text;

-- Customer snapshot (frozen at send time)
ALTER TABLE billing_documents
    ADD COLUMN IF NOT EXISTS snapshot_customer_name text,
    ADD COLUMN IF NOT EXISTS snapshot_customer_phone text,
    ADD COLUMN IF NOT EXISTS snapshot_customer_email text,
    ADD COLUMN IF NOT EXISTS snapshot_customer_address text;

-- Index for public token lookups (public route uses this)
CREATE INDEX IF NOT EXISTS idx_billing_documents_public_token
    ON billing_documents(public_token) WHERE public_token IS NOT NULL;

-- Index for conversion lookup (prevent duplicate conversions)
CREATE INDEX IF NOT EXISTS idx_billing_documents_source_quote
    ON billing_documents(source_quote_id) WHERE source_quote_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- businesses: logo_url column
-- ---------------------------------------------------------------------------
ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS logo_url text;

-- ---------------------------------------------------------------------------
-- Storage bucket for business logos
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-logos', 'business-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can manage their own business logos
-- The bucket is public-readable (logos appear on customer-facing documents)
-- but only the owning business can upload/replace/delete.
CREATE POLICY "business_logos_read_all"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'business-logos');

CREATE POLICY "business_logos_insert_own"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'business-logos'
        AND (storage.foldername(name))[1] IN (
            SELECT id::text FROM businesses WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "business_logos_update_own"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'business-logos'
        AND (storage.foldername(name))[1] IN (
            SELECT id::text FROM businesses WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        bucket_id = 'business-logos'
        AND (storage.foldername(name))[1] IN (
            SELECT id::text FROM businesses WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "business_logos_delete_own"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'business-logos'
        AND (storage.foldername(name))[1] IN (
            SELECT id::text FROM businesses WHERE user_id = auth.uid()
        )
    );
