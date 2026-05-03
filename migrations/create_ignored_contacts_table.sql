-- Create ignored_contacts table
-- Allows businesses to mark phone numbers as ignored/personal
-- ReplyFlow will not create leads, send SMS, or schedule follow-ups for ignored numbers

CREATE TABLE IF NOT EXISTS ignored_contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    phone_number text NOT NULL,
    label text NULL,
    reason text NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE(business_id, phone_number)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ignored_contacts_business_phone ON ignored_contacts(business_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_ignored_contacts_business_id ON ignored_contacts(business_id);

-- Enable RLS on ignored_contacts table
ALTER TABLE ignored_contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ignored_contacts
-- Users can only view ignored contacts for their own businesses
CREATE POLICY "Users can view own ignored contacts"
ON ignored_contacts FOR SELECT
USING (
    auth.uid() IN (
        SELECT user_id FROM businesses WHERE id = business_id
    )
);

-- Users can insert ignored contacts for their own businesses
CREATE POLICY "Users can insert own ignored contacts"
ON ignored_contacts FOR INSERT
WITH CHECK (
    auth.uid() IN (
        SELECT user_id FROM businesses WHERE id = business_id
    )
);

-- Users can update ignored contacts for their own businesses
CREATE POLICY "Users can update own ignored contacts"
ON ignored_contacts FOR UPDATE
USING (
    auth.uid() IN (
        SELECT user_id FROM businesses WHERE id = business_id
    )
)
WITH CHECK (
    auth.uid() IN (
        SELECT user_id FROM businesses WHERE id = business_id
    )
);

-- Users can delete ignored contacts for their own businesses
CREATE POLICY "Users can delete own ignored contacts"
ON ignored_contacts FOR DELETE
USING (
    auth.uid() IN (
        SELECT user_id FROM businesses WHERE id = business_id
    )
);

-- Service role can bypass RLS for webhook processing
CREATE POLICY "Service role full access"
ON ignored_contacts FOR ALL
USING (current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role')
WITH CHECK (current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role');
