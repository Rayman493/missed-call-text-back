-- Fix business logo storage bucket provisioning.
-- Ensures the 'business-logos' bucket exists with the correct configuration
-- including file_size_limit and allowed_mime_types.
-- Idempotent: safe to run multiple times.

-- ---------------------------------------------------------------------------
-- Ensure bucket exists with correct config (insert or update)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'business-logos',
    'business-logos',
    true,
    2097152,  -- 2 MB
    ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Storage policies (drop + recreate to handle updates cleanly)
-- ---------------------------------------------------------------------------

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "business_logos_read_all" ON storage.objects;
DROP POLICY IF EXISTS "business_logos_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "business_logos_update_own" ON storage.objects;
DROP POLICY IF EXISTS "business_logos_delete_own" ON storage.objects;

-- Public read: logos appear on customer-facing documents (quotes, invoices, hosted pages)
CREATE POLICY "business_logos_read_all"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'business-logos');

-- Insert: only the owning business can upload to their prefix
CREATE POLICY "business_logos_insert_own"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'business-logos'
        AND (storage.foldername(name))[1] IN (
            SELECT id::text FROM businesses WHERE user_id = auth.uid()
        )
    );

-- Update: only the owning business can replace their logo
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

-- Delete: only the owning business can delete their logo
CREATE POLICY "business_logos_delete_own"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'business-logos'
        AND (storage.foldername(name))[1] IN (
            SELECT id::text FROM businesses WHERE user_id = auth.uid()
        )
    );
